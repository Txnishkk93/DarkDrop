import { NextResponse } from 'next/server';
import { jobStore } from '@/lib/server/jobStore';

export async function GET() {
  try {
    // Basic check to ensure jobStore is accessible
    jobStore.getJob('test');
    
    return NextResponse.json({ status: 'ok', store: 'connected' });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  }
}
