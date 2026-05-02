import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ReceiptRow } from '@/lib/types';

const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID || 'placeholder_qbo_client_id';
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET || 'placeholder_qbo_client_secret';
const QBO_REDIRECT_URI = process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/qbo/callback` : 'http://localhost:3000/api/integrations/qbo/callback';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'connect') {
    // Initiate OAuth2 Handshake
    const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${QBO_CLIENT_ID}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(QBO_REDIRECT_URI)}&state=security_token`;
    return NextResponse.redirect(authUrl);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { receiptId, action } = body;

    if (action === 'sync') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const { data: receipt, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('id', receiptId)
        .single();

      if (error || !receipt) {
        return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
      }

      // Foundational mapping logic to QBO "Purchase" entity
      const qboPurchaseEntity = mapReceiptToQBOPurchase(receipt as ReceiptRow);

      // TODO: Execute actual QBO API call here using stored OAuth tokens
      // const qboResponse = await fetch('https://quickbooks.api.intuit.com/v3/company/COMPANY_ID/purchase', { ... })
      
      return NextResponse.json({ 
        success: true, 
        message: 'Receipt synced to QBO successfully (Simulated)',
        payload: qboPurchaseEntity 
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Map our ReceiptRow to QBO Purchase Entity
function mapReceiptToQBOPurchase(receipt: ReceiptRow) {
  return {
    AccountRef: {
      value: "FIXME_ACCOUNT_ID", // Needs to be mapped from category
      name: receipt.category || "Uncategorized"
    },
    PaymentType: receipt.payment_method === 'credit_card' ? 'CreditCard' : 'Cash',
    EntityRef: {
      value: "FIXME_VENDOR_ID", // Needs to be matched with QBO Vendor
      name: receipt.vendor_name,
      type: "Vendor"
    },
    TotalAmt: receipt.total_amount,
    TxnDate: receipt.transaction_date,
    PrivateNote: receipt.notes || `Receipt ID: ${receipt.id}`,
    Line: [
      {
        Amount: receipt.subtotal || receipt.total_amount,
        DetailType: "AccountBasedExpenseLineDetail",
        AccountBasedExpenseLineDetail: {
          AccountRef: {
            value: "FIXME_EXPENSE_ACCOUNT_ID"
          },
          TaxAmount: receipt.tax_amount || 0,
          TaxCodeRef: {
            value: "TAX"
          }
        },
        Description: `Purchase from ${receipt.vendor_name}`
      }
    ]
  };
}
