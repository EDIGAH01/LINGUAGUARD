import * as React from "react";
import { IconProps } from "lucide-react";

const commonProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const InstagramIcon = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <svg ref={ref} viewBox="0 0 24 24" {...commonProps} {...props}>
    <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="M17.5 6.5h.01" />
  </svg>
));
InstagramIcon.displayName = "InstagramIcon";

export const TwitterIcon = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <svg ref={ref} viewBox="0 0 24 24" {...commonProps} {...props}>
    <path d="M22 5.8a8.3 8.3 0 01-2.4.7 4.2 4.2 0 001.8-2.4 8.4 8.4 0 01-2.7 1 4.2 4.2 0 00-7.2 3.8A11.9 11.9 0 013 5.4a4.2 4.2 0 001.3 5.6 4.2 4.2 0 01-1.9-.5v.1a4.2 4.2 0 003.3 4.1 4.2 4.2 0 01-1.9.1 4.2 4.2 0 003.9 2.9A8.4 8.4 0 012 19.4a11.8 11.8 0 006.4 1.9c7.7 0 11.9-6.4 11.9-12v-.5A8.6 8.6 0 0022 5.8z" />
  </svg>
));
TwitterIcon.displayName = "TwitterIcon";

export const FacebookIcon = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <svg ref={ref} viewBox="0 0 24 24" {...commonProps} {...props}>
    <rect x="2" y="2" width="20" height="20" rx="4" ry="4" />
    <path d="M14.5 8H12a1 1 0 00-1 1v2H9v2.5h2v6H14v-6h2l.5-2.5H14V9.5c0-.4.1-.5.5-.5h1.5V8z" />
  </svg>
));
FacebookIcon.displayName = "FacebookIcon";

export const YoutubeIcon = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <svg ref={ref} viewBox="0 0 24 24" {...commonProps} {...props}>
    <rect x="3" y="6" width="18" height="12" rx="4" ry="4" />
    <polygon fill="currentColor" stroke="none" points="10 8.5 16 12 10 15.5" />
  </svg>
));
YoutubeIcon.displayName = "YoutubeIcon";
