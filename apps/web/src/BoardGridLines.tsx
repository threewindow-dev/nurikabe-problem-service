import { useLayoutEffect, useRef } from 'react';

export function BoardGridLines({ columns, rows }: { columns: number; rows: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const board = canvas?.parentElement;
    const first = board?.children.item(0);
    const last = board?.children.item(columns * rows - 1);
    if (!canvas || !board || !first || !last || !first.getBoundingClientRect().width) return;

    const context = canvas.getContext('2d');
    if (!context) {
      console.warn('Board grid Canvas unavailable; using CSS grid lines.');
      return;
    }

    let frame = 0;
    let resolution: MediaQueryList | undefined;
    const viewport = window.visualViewport;

    function scheduleDraw() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    }

    function watchResolution() {
      resolution?.removeEventListener('change', watchResolution);
      resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      resolution.addEventListener('change', watchResolution);
      scheduleDraw();
    }

    function draw() {
      if (!canvas || !board || !context || !first || !last) return;
      const start = first.getBoundingClientRect();
      const end = last.getBoundingClientRect();
      const scale = window.devicePixelRatio * (viewport?.scale ?? 1);
      const offsetX = viewport?.offsetLeft ?? 0;
      const offsetY = viewport?.offsetTop ?? 0;
      const pixelX = (x: number) => Math.round((x - offsetX) * scale);
      const pixelY = (y: number) => Math.round((y - offsetY) * scale);
      const left = pixelX(start.left);
      const top = pixelY(start.top);
      const width = pixelX(end.right) - left;
      const height = pixelY(end.bottom) - top;
      if (width <= 0 || height <= 0) return;

      // Snap the bitmap's origin and size as well as the lines inside it.
      canvas.style.left = `${left / scale + offsetX - start.left}px`;
      canvas.style.top = `${top / scale + offsetY - start.top}px`;
      canvas.style.width = `${width / scale}px`;
      canvas.style.height = `${height / scale}px`;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.fillStyle = getComputedStyle(board).backgroundColor;
      for (let col = 1; col < columns; col++) {
        const cell = board.children.item(col);
        if (cell) context.fillRect(pixelX(cell.getBoundingClientRect().left) - left, 0, 1, height);
      }
      for (let row = 1; row < rows; row++) {
        const cell = board.children.item(row * columns);
        if (cell) context.fillRect(0, pixelY(cell.getBoundingClientRect().top) - top, width, 1);
      }
    }

    board.classList.add('board-with-canvas-grid');
    draw();
    const observer = new ResizeObserver(scheduleDraw);
    observer.observe(board);
    watchResolution();
    window.addEventListener('resize', scheduleDraw);
    window.addEventListener('scroll', scheduleDraw, { capture: true, passive: true });
    viewport?.addEventListener('resize', scheduleDraw);
    viewport?.addEventListener('scroll', scheduleDraw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resolution?.removeEventListener('change', watchResolution);
      window.removeEventListener('resize', scheduleDraw);
      window.removeEventListener('scroll', scheduleDraw, true);
      viewport?.removeEventListener('resize', scheduleDraw);
      viewport?.removeEventListener('scroll', scheduleDraw);
      board.classList.remove('board-with-canvas-grid');
    };
  }, [columns, rows]);

  return <canvas aria-hidden="true" className="board-grid-lines" ref={canvasRef} />;
}
