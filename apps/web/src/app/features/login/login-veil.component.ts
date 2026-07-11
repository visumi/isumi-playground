import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, viewChild } from "@angular/core";

const vertexShader = `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragmentShader = `
  precision mediump float;
  uniform vec2 uResolution;
  uniform float uTime;

  float wave(vec2 point, float phase) {
    return sin(point.x * 2.2 + phase) + sin(point.y * 2.7 - phase * 0.7) + sin((point.x + point.y) * 1.6 + phase * 0.45);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
    float field = wave(uv * 1.7, uTime * 0.18) * 0.18;
    field += sin(length(uv - vec2(-0.52, 0.22)) * 7.0 - uTime * 0.33) * 0.065;
    field += sin(length(uv - vec2(0.62, -0.34)) * 6.0 + uTime * 0.24) * 0.05;
    float veil = smoothstep(-0.2, 0.58, field - length(uv) * 0.13);
    vec3 base = vec3(0.035, 0.035, 0.05);
    vec3 purple = vec3(0.32, 0.11, 0.59);
    gl_FragColor = vec4(mix(base, purple, veil * 0.58), 1.0);
  }
`;

@Component({
  selector: "isumi-login-veil",
  standalone: true,
  template: `<canvas #canvas class="block size-full" aria-hidden="true"></canvas>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginVeilComponent implements AfterViewInit {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>("canvas");
  private readonly destroyRef = inject(DestroyRef);

  ngAfterViewInit(): void {
    this.initialize();
  }

  private initialize(): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = this.canvas().nativeElement;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) return;

    const program = this.createProgram(gl);
    if (!program) return;

    const position = gl.getAttribLocation(program, "position");
    const resolution = gl.getUniformLocation(program, "uResolution");
    const time = gl.getUniformLocation(program, "uTime");
    const buffer = gl.createBuffer();
    if (!buffer || position < 0 || !resolution || !time) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.useProgram(program);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio, 1.5);
      canvas.width = Math.max(1, Math.round(bounds.width * scale));
      canvas.height = Math.max(1, Math.round(bounds.height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolution, canvas.width, canvas.height);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const startedAt = performance.now();
    let frame = 0;
    const render = (now: number) => {
      gl.uniform1f(time, (now - startedAt) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    });
  }

  private createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
    const vertex = this.compileShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fragment = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    if (!vertex || !fragment) return null;

    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
  }

  private compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  }
}
