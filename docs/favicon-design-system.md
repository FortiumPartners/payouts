# Fortium Software Favicon Design System

A consistent favicon system for all Fortium platform applications.

## Design Principles

- **Shape**: Rounded square (6px radius on 32x32)
- **Typography**: System font, bold weight, centered
- **Colors**: Distinct color per app for quick identification
- **Format**: SVG (scalable, small file size)

## Application Favicons

### Payouts (P) - Emerald Green `#10B981`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#10B981"/>
  <text x="16" y="23" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="white" text-anchor="middle">P</text>
</svg>
```

### Talent (T) - Purple `#8B5CF6`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#8B5CF6"/>
  <text x="16" y="23" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="white" text-anchor="middle">T</text>
</svg>
```

### Pipeline (Pi) - Blue `#3B82F6`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#3B82F6"/>
  <text x="16" y="23" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="white" text-anchor="middle">Pi</text>
</svg>
```

### FPQBO (Q) - Amber `#F59E0B`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#F59E0B"/>
  <text x="16" y="23" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="white" text-anchor="middle">Q</text>
</svg>
```

### Atlas (A) - Teal `#14B8A6`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#14B8A6"/>
  <text x="16" y="23" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="white" text-anchor="middle">A</text>
</svg>
```

### Outbound (O) - Rose `#F43F5E`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#F43F5E"/>
  <text x="16" y="23" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="white" text-anchor="middle">O</text>
</svg>
```

### Gateway (G) - Slate `#64748B`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#64748B"/>
  <text x="16" y="23" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="white" text-anchor="middle">G</text>
</svg>
```

### LXP (L) - Indigo `#6366F1`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#6366F1"/>
  <text x="16" y="23" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="white" text-anchor="middle">L</text>
</svg>
```

## Color Reference

| App | Letter | Color Name | Hex | Use Case |
|-----|--------|------------|-----|----------|
| Payouts | P | Emerald | #10B981 | Money/payments |
| Talent | T | Purple | #8B5CF6 | People/HR |
| Pipeline | Pi | Blue | #3B82F6 | Flow/process |
| FPQBO | Q | Amber | #F59E0B | Accounting |
| Atlas | A | Teal | #14B8A6 | Navigation/data |
| Outbound | O | Rose | #F43F5E | Outreach/action |
| Gateway | G | Slate | #64748B | Portal/entry |
| LXP | L | Indigo | #6366F1 | Leadership |

## Implementation

1. Save the SVG content to `public/favicon.svg` in your frontend project
2. Reference in `index.html`:
   ```html
   <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
   ```

## Browser Tab Preview

```
[P] Payouts  [T] Talent  [Pi] Pipeline  [Q] FPQBO
[A] Atlas   [O] Outbound  [G] Gateway   [L] LXP
```

All colors are from Tailwind CSS palette for consistency.
