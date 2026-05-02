import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ReceiptRow } from '@/lib/types';

const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID || 'placeholder_xero_client_id';
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET || 'placeholder_xero_client_secret';
const XERO_REDIRECT_URI = process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/xero/callback` : 'http://localhost:3000/api/integrations/xero/callback';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'connect') {
    // Initiate OAuth2 Handshake
    const authUrl = `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=${XERO_CLIENT_ID}&redirect_uri=${encodeURIComponent(XERO_REDIRECT_URI)}&scope=offline_access accounting.transactions accounting.contacts&state=security_token`;
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

      // Foundational mapping logic to Xero "Purchase" (Bank Transaction or Receipt)
      const xeroPurchaseEntity = mapReceiptToXeroPurchase(receipt as ReceiptRow);

      // TODO: Execute actual Xero API call here using stored OAuth tokens
      // const xeroResponse = await fetch('https://api.xero.com/api.xro/2.0/Receipts', { ... })
      
      return NextResponse.json({ 
        success: true, 
        message: 'Receipt synced to Xero successfully (Simulated)',
        payload: xeroPurchaseEntity 
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Map our ReceiptRow to Xero Purchase Entity (BankTransaction format)
function mapReceiptToXeroPurchase(receipt: ReceiptRow) {
  return {
    Type: "SPEND",
    Contact: {
      Name: receipt.vendor_name || "Unknown Vendor"
    },
    DateString: receipt.transaction_date,
    LineAmountTypes: "Inclusive",
    LineItems: [
      {
        Description: `Purchase from ${receipt.vendor_name} - ${receipt.category || 'Uncategorized'}`,
        Quantity: 1.0,
        UnitAmount: receipt.total_amount,
        AccountCode: "FIXME_ACCOUNT_CODE", // Map from category
        TaxAmount: receipt.tax_amount || 0,
        TaxType: receipt.tax_amount > 0 ? "INPUT" : "NONE" // Needs mapping based on province
      }
    ],
    Reference: `Receipt ID: ${receipt.id}`,
    TotalTax: receipt.tax_amount || 0,
    Total: receipt.total_amount
  };
}
