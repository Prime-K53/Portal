import React, { useState } from 'react';
import { Info } from 'lucide-react';

interface FieldTooltipProps {
  tooltip: string;
  children: React.ReactNode;
}

export function FieldTooltip({ tooltip, children }: FieldTooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-[5000] bg-slate-900 text-white text-[11px] font-medium px-3 py-2 rounded-xl shadow-lg max-w-xs whitespace-normal" role="tooltip">
          {tooltip}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
        </div>
      )}
    </div>
  );
}