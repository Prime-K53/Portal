console.log('TEST START');
try {
  const res = await fetch('https://primeerpsystem.onrender.com/api/portal/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: 'CUST-0001', full_name: 'Acme LTD' }),
  });
  const body = await res.json();
  console.log('STATUS:', res.status);
  console.log('BODY:', JSON.stringify(body));
} catch (e) {
  console.log('ERROR:', e.message);
}
console.log('TEST END');
