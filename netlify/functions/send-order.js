// Netlify Function: send-order
// Receives an order (POST JSON) from the checkout and emails it to the store
// inbox via Gmail SMTP using nodemailer (no external packages to install).
//
// Required environment variables (set in Netlify → Site settings → Environment):
//   EMAIL_USER -> the Gmail address used to send (e.g. you@gmail.com)
//   EMAIL_PASS -> a Gmail App Password for that account (not the login password)

const nodemailer = require('nodemailer');

const ORDER_INBOX = 'limitless.apparel246@gmail.com';

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Parse the incoming order
  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: 'Invalid JSON body' };
  }

  const {
    customer_name,
    customer_email,
    customer_phone,
    fulfillment_method,
    parish,
    delivery_address,
    payment_method,
    order_items,
    delivery_fee,
    grand_total,
    order_date
  } = data;

  // Basic validation of the essential fields
  if (!customer_name || !customer_email || !customer_phone || !order_items) {
    return { statusCode: 400, body: 'Missing required order fields' };
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('EMAIL_USER and/or EMAIL_PASS environment variables are not set.');
    return { statusCode: 500, body: 'Email service is not configured' };
  }

  const isDelivery = String(fulfillment_method || '').toLowerCase() === 'delivery';

  // Helper function to escape HTML
  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  // Parse order_items (array of shirt objects with name, size, image, qty)
  let itemsArray = [];
  try {
    if (typeof order_items === 'string') {
      itemsArray = JSON.parse(order_items);
    } else if (Array.isArray(order_items)) {
      itemsArray = order_items;
    }
  } catch (err) {
    console.warn('Failed to parse order_items as JSON, using as string');
  }

  // Build a clear, readable email body
  const lines = [
    'NEW ORDER — Limitless Apparel',
    '================================',
    '',
    'CONTACT',
    `  Name:  ${customer_name}`,
    `  Email: ${customer_email}`,
    `  Phone: ${customer_phone}`,
    '',
    'FULFILLMENT',
    `  Method: ${fulfillment_method || 'N/A'}`
  ];

  if (isDelivery) {
    lines.push(`  Parish:  ${parish || 'N/A'}`);
    lines.push(`  Address: ${delivery_address || 'N/A'}`);
    lines.push(`  Delivery fee: ${delivery_fee || 'N/A'}`);
  }

  lines.push(
    '',
    'PAYMENT',
    `  Method: ${payment_method || 'N/A'}`,
    '',
    'ORDER ITEMS'
  );

  // Add detailed item information
  if (Array.isArray(itemsArray) && itemsArray.length > 0) {
    itemsArray.forEach((item, idx) => {
      lines.push(`\n  Item ${idx + 1}:`);
      lines.push(`    Shirt: ${item.name || 'N/A'}`);
      lines.push(`    Size: ${item.size || 'N/A'}`);
      if (item.color) {
        lines.push(`    Color: ${item.color}`);
      }
      lines.push(`    Quantity: ${item.qty || 1}`);
      lines.push(`    Price: ${item.unit || 'N/A'} × ${item.qty || 1}`);
      if (item.image) {
        lines.push(`    Image: ${item.image}`);
      }
    });
  } else {
    lines.push(String(order_items));
  }

  lines.push(
    '',
    '================================',
    `  GRAND TOTAL: ${grand_total || 'N/A'}`,
    '',
    `Placed: ${order_date || new Date().toLocaleString()}`
  );

  const text = lines.join('\n');

  // Build HTML items section with images and details
  let itemsHtml = '';
  if (Array.isArray(itemsArray) && itemsArray.length > 0) {
    itemsHtml = '<table style="width:100%;border-collapse:collapse;margin:12px 0">';
    itemsArray.forEach((item, idx) => {
      const imgStyle = 'max-width:150px;height:auto;display:block;border-radius:4px;margin-bottom:8px';
      itemsHtml += `
        <tr style="border-bottom:1px solid #ddd;padding:12px 0">
          <td style="padding:12px;vertical-align:top">
            <div><strong>Item ${idx + 1}</strong></div>
            <div style="margin-top:8px;font-size:12px">
              <div><strong>Shirt:</strong> ${escapeHtml(item.name || 'N/A')}</div>
              <div><strong>Size:</strong> ${escapeHtml(item.size || 'N/A')}</div>
              ${item.color ? `<div><strong>Color:</strong> ${escapeHtml(item.color)}</div>` : ''}
              <div><strong>Quantity:</strong> ${item.qty || 1}</div>
              <div><strong>Price:</strong> $${item.unit || '0'} × ${item.qty || 1}</div>
              ${item.image ? `<div style="margin-top:8px"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" style="${imgStyle}"></div>` : ''}
            </div>
          </td>
        </tr>
      `;
    });
    itemsHtml += '</table>';
  } else {
    itemsHtml = `<pre style="margin:0;font-family:inherit;white-space:pre-wrap">${escapeHtml(String(order_items))}</pre>`;
  }

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5">' +
    '<h2 style="margin:0 0 8px">New Order — Limitless Apparel</h2>' +
    '<h3 style="margin:16px 0 4px">Contact</h3>' +
    `<p style="margin:0"><strong>Name:</strong> ${escapeHtml(customer_name)}<br>` +
    `<strong>Email:</strong> ${escapeHtml(customer_email)}<br>` +
    `<strong>Phone:</strong> ${escapeHtml(customer_phone)}</p>` +
    '<h3 style="margin:16px 0 4px">Fulfillment</h3>' +
    `<p style="margin:0"><strong>Method:</strong> ${escapeHtml(fulfillment_method || 'N/A')}` +
    (isDelivery
      ? `<br><strong>Parish:</strong> ${escapeHtml(parish || 'N/A')}` +
        `<br><strong>Address:</strong> ${escapeHtml(delivery_address || 'N/A')}` +
        `<br><strong>Delivery fee:</strong> ${escapeHtml(String(delivery_fee) || 'N/A')}`
      : '') +
    '</p>' +
    '<h3 style="margin:16px 0 4px">Payment</h3>' +
    `<p style="margin:0"><strong>Method:</strong> ${escapeHtml(payment_method || 'N/A')}</p>` +
    '<h3 style="margin:16px 0 4px">Order Items</h3>' +
    itemsHtml +
    `<h3 style="margin:16px 0 4px">Grand Total: ${escapeHtml(String(grand_total) || 'N/A')}</h3>` +
    `<p style="margin:12px 0 0;color:#666;font-size:12px">Placed: ${escapeHtml(order_date || new Date().toLocaleString())}</p>` +
    '</div>';

  // Configure the Gmail SMTP transport via nodemailer
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  // Build and send the email
  const mailOptions = {
    from: `"Limitless Apparel Orders" <${process.env.EMAIL_USER}>`,
    to: ORDER_INBOX,
    replyTo: customer_email,
    subject: `New Order — ${customer_name} (${grand_total || ''})`.trim(),
    text,
    html
  };

  try {
    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, message: 'Order email sent' })
    };
  } catch (err) {
    console.error('Failed to send order email:', err);
    return { statusCode: 502, body: 'Failed to send order email' };
  }
};
