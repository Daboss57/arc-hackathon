"use client";

import { memo, useCallback, useEffect, useRef } from "react";

interface GlowingEffectProps {
  blur?: number;
  inactiveZone?: number;
  proximity?: number;
  spread?: number;
  variant?: "default" | "white";
  glow?: boolean;
  className?: string;
  disabled?: boolean;
  movementDuration?: number;
  borderWidth?: number;
}

const GlowingEffect = memo(
  ({
    blur = 0,
    inactiveZone = 0.7,
    proximity = 0,
    spread = 20,
    variant = "default",
    glow = false,
    className = "",
    movementDuration = 2,
    borderWidth = 1,
    disabled = true,
  }: GlowingEffectProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const lastPosition = useRef({ x: 0, y: 0 });
    const animationFrameRef = useRef<number>(0);

    const handleMove = useCallback(
      (e?: MouseEvent | { x: number; y: number }) => {
        if (!containerRef.current) return;

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        animationFrameRef.current = requestAnimationFrame(() => {
          const element = containerRef.current;
          if (!element) return;

          const { left, top, width, height } = element.getBoundingClientRect();
          const mouseX = e ? ("clientX" in e ? e.clientX : e.x) - left : lastPosition.current.x;
          const mouseY = e ? ("clientY" in e ? e.clientY : e.y) - top : lastPosition.current.y;

          lastPosition.current = { x: mouseX, y: mouseY };

          const center = { x: width / 2, y: height / 2 };
          const distanceFromCenter = Math.sqrt(
            Math.pow(mouseX - center.x, 2) + Math.pow(mouseY - center.y, 2)
          );
          const maxDistance = Math.sqrt(
            Math.pow(width / 2, 2) + Math.pow(height / 2, 2)
          );
          const distanceRatio = distanceFromCenter / maxDistance;

          if (distanceRatio < inactiveZone) {
            element.style.setProperty("--glow-opacity", "0");
            return;
          }

          const adjustedRatio =
            (distanceRatio - inactiveZone) / (1 - inactiveZone);
          const opacity = Math.min(adjustedRatio * 1.5, 1);

          element.style.setProperty("--glow-opacity", String(opacity));
          element.style.setProperty("--glow-x", `${mouseX}px`);
          element.style.setProperty("--glow-y", `${mouseY}px`);
        });
      },
      [inactiveZone]
    );

    useEffect(() => {
      if (disabled) return;

      const handleMouseMove = (e: MouseEvent) => handleMove(e);
      window.addEventListener("mousemove", handleMouseMove);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }, [handleMove, disabled]);

    return (
      <div
        ref={containerRef}
        style={
          {
            "--glow-spread": `${spread}px`,
            "--glow-blur": `${blur}px`,
            "--glow-opacity": "0",
            "--proximity": `${proximity}px`,
            "--glow-x": "0px",
            "--glow-y": "0px",
            "--movement-duration": `${movementDuration}s`,
            "--border-width": `${borderWidth}px`,
          } as React.CSSProperties
        }
        className={`glow-effect ${variant} ${glow ? "glow-visible" : ""} ${className}`}
      >
        <div className="glow-effect-inner" />
        <div className="glow-effect-border" />
      </div>
    );
  }
);

GlowingEffect.displayName = "GlowingEffect";

export { GlowingEffect };
