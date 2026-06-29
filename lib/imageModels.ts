/**
 * Image-generation models available for creating personas (all FAL-hosted, so they
 * use the app's FAL key). Shared by the Generate-model modal (labels/cost) and the
 * generate route (endpoints/inputs).
 */
export interface ImageModelMeta {
  id: string;
  label: string;
  provider: string;
  /** approx USD per image at the quality we use */
  costPerImage: number;
  /** which API key it needs */
  needs: 'fal' | 'openai' | 'higgsfield';
  supportsReference: boolean;
}

export const IMAGE_MODELS: ImageModelMeta[] = [
  { id: 'gpt-image-1', label: 'GPT Image (gen 2)', provider: 'OpenAI · via FAL', costPerImage: 0.06, needs: 'fal', supportsReference: true },
  { id: 'higgsfield-soul', label: 'Image gen 2 · Higgsfield (Soul)', provider: 'Higgsfield', costPerImage: 0.06, needs: 'higgsfield', supportsReference: false },
  { id: 'flux-dev', label: 'FLUX.1 [dev]', provider: 'Black Forest Labs · FAL', costPerImage: 0.025, needs: 'fal', supportsReference: true },
  { id: 'flux-schnell', label: 'FLUX.1 [schnell] (fast)', provider: 'Black Forest Labs · FAL', costPerImage: 0.003, needs: 'fal', supportsReference: false },
];

export const DEFAULT_IMAGE_MODEL = 'gpt-image-1';

export function getImageModel(id?: string): ImageModelMeta {
  return IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS[0];
}
