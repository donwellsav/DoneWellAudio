declare module 'onnxruntime-web' {
  export interface TensorLike {
    data: Float32Array
  }

  export class Tensor {
    constructor(type: string, data: Float32Array, dims: number[])
  }

  export class InferenceSession {
    static create(path: string | ArrayBuffer): Promise<InferenceSession>
    run(feeds: Record<string, unknown>): Promise<Record<string, TensorLike>>
    release(): void
  }
}
