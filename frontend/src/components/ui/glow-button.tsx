import React, { useState, useRef } from "react";
import { motion } from "motion/react";

interface GlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  glowColor?: string;
  glowSize?: number;
  glowIntensity?: number;
}

export function GlowButton({
  children,
  className = "",
  glowColor = "rgba(59, 130, 246, 0.9)",
  glowSize = 140,
  glowIntensity = 25,
  ...props
}: GlowButtonProps) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  // Parse glow color to create gradient
  const createGlowGradient = () => {
    // Extract RGB values from glowColor if it's in rgba format
    const match = glowColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const [, r, g, b] = match;
      return `radial-gradient(circle, rgba(${r}, ${g}, ${b}, 0.9) 0%, rgba(${r}, ${g}, ${b}, 0.5) 25%, rgba(${r}, ${g}, ${b}, 0.25) 50%, transparent 70%)`;
    }
    // Fallback to default blue gradient
    return "radial-gradient(circle, rgba(59, 130, 246, 0.9) 0%, rgba(59, 130, 246, 0.5) 25%, rgba(147, 197, 253, 0.25) 50%, transparent 70%)";
  };

  return (
    <button
      ref={buttonRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden ${className}`}
      {...props}
    >
      {/* Smooth cursor glow with Motion spring */}
      <motion.div
        className="absolute pointer-events-none"
        animate={{
          left: mousePosition.x,
          top: mousePosition.y,
          opacity: isHovering ? 1 : 0,
        }}
        transition={{
          type: "spring",
          damping: 30,
          stiffness: 300,
          mass: 0.5,
          opacity: { duration: 0.2 },
        }}
        style={{
          transform: "translate(-50%, -50%)",
          width: `${glowSize}px`,
          height: `${glowSize}px`,
          background: createGlowGradient(),
          filter: `blur(${glowIntensity}px)`,
        }}
      />

      {/* Content */}
      <span className="relative z-10 flex items-center justify-center gap-1.5 w-full h-full">
        {children}
      </span>
    </button>
  );
}
