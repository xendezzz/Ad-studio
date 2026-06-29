import { StudioCanvas } from '@/components/studio/StudioCanvas';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="h-screen w-screen overflow-hidden">
      <StudioCanvas projectId={id} />
    </main>
  );
}
