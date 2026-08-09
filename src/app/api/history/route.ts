import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireApiSecret } from '@/lib/utils/auth';

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      // Gracefully return empty history if database is not configured
      return NextResponse.json([]);
    }
    const reports = await prisma.reportHistory.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(reports);
  } catch (error) {
    console.error('Failed to fetch history:', error);
    return NextResponse.json({ message: 'Failed to fetch history' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ message: 'Database not configured' }, { status: 400 });
    }
    const body = await req.json();
    const { id, companyName, fileName, reportData, pdfBase64, status, reviewerName, sebiRegNo, approvedAt, modelUsedForFinancials } = body;
    
    if (!id || !companyName || !fileName || !reportData) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    const report = await prisma.reportHistory.upsert({
      where: { id },
      update: {
        companyName,
        fileName,
        reportData,
        pdfBase64,
        status: status || undefined,
        reviewerName: reviewerName || undefined,
        sebiRegNo: sebiRegNo || undefined,
        approvedAt: approvedAt ? new Date(approvedAt) : undefined,
        modelUsedForFinancials: modelUsedForFinancials || undefined,
        createdAt: new Date()
      },
      create: {
        id,
        companyName,
        fileName,
        reportData,
        pdfBase64,
        status: status || 'draft',
        reviewerName: reviewerName || null,
        sebiRegNo: sebiRegNo || null,
        approvedAt: approvedAt ? new Date(approvedAt) : null,
        modelUsedForFinancials: modelUsedForFinancials || null
      }
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error('Failed to save history item:', error);
    return NextResponse.json({ message: 'Failed to save history item' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authError = requireApiSecret(req as Parameters<typeof requireApiSecret>[0]);
  if (authError) return authError;
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ message: 'Database not configured' }, { status: 400 });
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ message: 'Missing report ID' }, { status: 400 });
    }

    await prisma.reportHistory.delete({
      where: { id }
    });

    return NextResponse.json({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Failed to delete history item:', error);
    return NextResponse.json({ message: 'Failed to delete history item' }, { status: 500 });
  }
}
