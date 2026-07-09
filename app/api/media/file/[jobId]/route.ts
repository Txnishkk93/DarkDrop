import { NextResponse } from 'next/server';
import { jobStore } from '@/lib/server/jobStore';
import { DOWNLOAD_DIR } from '@/lib/server/downloadDir';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const job = jobStore.getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== 'completed' || !job.file) {
      return NextResponse.json({ error: 'File not ready yet' }, { status: 400 });
    }

    const filePath = path.join(DOWNLOAD_DIR, job.file);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
    }

    const stats = await fs.stat(filePath);
    const data = createReadStream(filePath);
    
    // Node.js readable streams can be mapped to Web Streams for Next.js responses
    const webStream = new ReadableStream({
      start(controller) {
        data.on('data', (chunk) => controller.enqueue(chunk));
        data.on('end', () => {
          controller.close();
          // Clean up the file after streaming finishes
          fs.unlink(filePath).catch(console.error);
          jobStore.deleteJob(jobId);
        });
        data.on('error', (err) => controller.error(err));
      },
      cancel() {
        data.destroy();
      }
    });

    return new NextResponse(webStream, {
      headers: {
        'Content-Disposition': `attachment; filename="${job.file}"`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': stats.size.toString(),
      },
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
