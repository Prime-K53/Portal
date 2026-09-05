/**
 * Sentry error tracking — privacy-first configuration.
 *
 * Only initialized in production builds. All outbound events pass through
 * a before-send filter that strips PII (access tokens, customer names,
 * invoice values, order numbers) before events leave the browser.
 *
 * Sensitive context that IS included (non-PII, purely structural):
 *   - Feature flag / environment tier
 *   - Active tab and route
 *   - API endpoint path (no query params)
 *   - HTTP status code
 *   - Response time
 *
 * Sensitive context that is ALWAYS excluded:
 *   - Authorization / Bearer tokens (headers stripped by DSN auth)
 *   - request.headers['authorization']
 *   - request.headers['cookie']
 *   - user.name, user.email
 *   - Extra / body data from API responses
 */

import * as Sentry from '@sentry/react';
import type { ErrorEvent, EventHint } from '@sentry/core';
import { env } from './features/customer-portal/config/env';

function sentryBeforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (!event.request) return null;

  // Strip query strings and fragment identifiers from URL — they can contain
  // invoice IDs, customer references, JWT fragments.
  if (event.request.url) {
    try {
      const url = new URL(event.request.url, 'https://placeholder');
      url.search = '';
      url.hash = '';
      event.request.url = url.toString().replace('https://placeholder', '');
    } catch {
      event.request.url = '(unparseable URL redacted)';
    }
  }

  // Remove cookie and authorization headers (Sentry SDK does not send body
  // by default, but we are defensive).
  if (event.request.headers) {
    delete event.request.headers['authorization'];
    delete event.request.headers['cookie'];
    delete event.request.headers['x-refresh-attempt'];
  }

  // Wipe extra / context data from API error responses — these can contain
  // customer names, invoice amounts, order lines.
  if (event.extra) event.extra = {};

  // Never attach user PII.
  if (event.user) {
    event.user.id = undefined;
    event.user.email = undefined;
    event.user.username = undefined;
  }

  return event;
}

export function initSentry(): void {
  if (!env.sentryDsn) return;
  if (import.meta.env.DEV) return;

  Sentry.init({
    dsn: env.sentryDsn,
    environment: import.meta.env.PROD ? 'production' : 'staging',

    // Capture all errors from React components and unhandled promise rejections.
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 0.05,

    // Disable the default session-replay canvas recorder — it captures UI
    // that may include customer data. Re-enable once a separate privacy-
    // reviewed session-replay DSN is provisioned.
    replaysSessionSampleRate: 0,

    // Privacy-first: never send cookies / auth headers / PII.
    sendClientReports: false,

    beforeSend: sentryBeforeSend,

    // Normalise ERP error codes so Sentry can group by error type.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'fetch' && breadcrumb.data?.url) {
        try {
          const url = new URL(breadcrumb.data.url as string, 'https://placeholder');
          breadcrumb.data.url = url.pathname; // strip query params
        } catch {
          breadcrumb.data.url = '(redacted)';
        }
      }
      return breadcrumb;
    },
  });
}

/**
 * Programmatic error reporter — preferred over raw Sentry.captureException
 * because it runs through the beforeSend filter and the tracesSampleRate gate.
 *
 * Use this in feature code:
 *   import { reportError } from '@/sentry';
 *   reportError(err, { tags: { feature: 'checkout' } });
 */
export function reportError(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  }
): void {
  if (!env.sentryDsn) return;
  if (import.meta.env.DEV) {
    console.error('[reportError]', error, context);
    return;
  }

  Sentry.withScope((scope) => {
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }
    if (context?.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }
    Sentry.captureException(error);
  });
}
