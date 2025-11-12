# CSS Architecture Documentation

## Overview

The CSS has been split into two separate files for better maintainability and organization:

1. **design-system.css** - Design tokens, variables, and reusable components
2. **app.css** - Application-specific styles and layouts

## File Structure

```
merged_http2/
├── design-system.css    # 754 lines - Design system foundation
├── app.css             # 1,239 lines - App-specific styles
└── index.html          # Updated to include both files
```

## How to Include These Files

Include **both** CSS files in your HTML in this specific order:

```html
<head>
  <link rel="stylesheet" href="design-system.css">
  <link rel="stylesheet" href="app.css">
</head>
```

**Important:** Always load `design-system.css` BEFORE `app.css` because the app styles depend on the design tokens defined in the design system.

## design-system.css

### What It Contains

This file provides the foundation for the entire application's visual design:

#### 1. Design Tokens (CSS Custom Properties)

**Colors:**
- Primitive color tokens (cream, gray, slate, teal, red, orange)
- RGB versions for opacity control
- Semantic color tokens (background, surface, text, primary, secondary, etc.)
- Colorful background palette (8 variations)
- Light mode and dark mode variants

**Typography:**
- Font families (FKGroteskNeue, Geist, Inter, monospace)
- Font sizes (xs through 4xl)
- Font weights (normal, medium, semibold, bold)
- Line heights and letter spacing

**Spacing:**
- Consistent spacing scale (0, 1px, 2px, 4px, 6px, 8px, 10px, 12px, 16px, 20px, 24px, 32px)

**Border Radius:**
- sm, base, md, lg, full

**Shadows:**
- xs, sm, md, lg, inset-sm

**Animation:**
- Duration tokens (fast, normal)
- Easing functions

**Layout:**
- Container breakpoints (sm, md, lg, xl)

#### 2. Theme Support

- Light mode (default)
- Dark mode via `@media (prefers-color-scheme: dark)`
- Manual theme switching via `[data-color-scheme="dark"]` and `[data-color-scheme="light"]`

#### 3. Base HTML Styles

- Global resets and normalization
- HTML and body defaults
- Typography elements (h1-h6, p, a, code, pre)

#### 4. Reusable Component Classes

**Buttons:**
- `.btn` - Base button
- `.btn--primary`, `.btn--secondary`, `.btn--outline` - Button variants
- `.btn--sm`, `.btn--lg` - Size modifiers
- `.btn--full-width` - Width modifier

**Forms:**
- `.form-control` - Input, textarea, select elements
- `.form-label` - Form labels
- `.form-group` - Form field wrapper

**Cards:**
- `.card` - Card container
- `.card__body`, `.card__header`, `.card__footer` - Card sections

**Status Indicators:**
- `.status` - Base status badge
- `.status--success`, `.status--error`, `.status--warning`, `.status--info` - Status variants

**Layout:**
- `.container` - Responsive container with max-widths

**Utility Classes:**
- Flexbox utilities (`.flex`, `.flex-col`, `.items-center`, `.justify-center`, `.justify-between`)
- Gap utilities (`.gap-4`, `.gap-8`, `.gap-16`)
- Margin utilities (`.m-0`, `.mt-8`, `.mb-8`, `.mx-8`, `.my-8`)
- Padding utilities (`.p-0`, `.py-8`, `.px-8`, `.py-16`, `.px-16`)
- Display utilities (`.block`, `.hidden`)

**Accessibility:**
- `.sr-only` - Screen reader only content
- Focus visible styles

### When to Edit design-system.css

Edit this file when you need to:
- Add or modify design tokens (colors, spacing, typography, etc.)
- Change theme colors or add new themes
- Modify base HTML element styles globally
- Add new reusable component patterns
- Update utility classes

### Best Practices

1. **Use CSS custom properties** - Always reference design tokens instead of hardcoding values
2. **Maintain consistency** - Follow existing naming conventions for new tokens
3. **Support both themes** - Update both light and dark mode when adding colors
4. **Document changes** - Add comments for complex or non-obvious decisions

## app.css

### What It Contains

Application-specific components and layouts:

1. **App Layout**
   - `.app-container` - Main app wrapper
   
2. **Progress & Wizard**
   - `.progress-bar`, `.progress-steps`, `.progress-step` - Multi-step wizard progress
   - `.wizard-step`, `.step-container` - Wizard step layouts
   
3. **Welcome Screen**
   - `.welcome-container`, `.welcome-title`, `.welcome-features` - Onboarding UI
   
4. **Dashboard Components**
   - `.dashboard-header`, `.dashboard-search`, `.dashboard-filters`
   - `.stats-grid`, `.stat-card`
   - `.connection-list`, `.connection-item`
   
5. **Modals & Overlays**
   - `.modal-overlay`, `.modal-content`
   - `.settings-panel`, `.monitoring-panel`
   - Privacy and terms modals
   
6. **Enterprise Features**
   - Health monitoring panels
   - Activity logs
   - Credential management UI
   - Audit components
   
7. **Footer**
   - `.legal-footer`, `.legal-links` - Legal and copyright information

### When to Edit app.css

Edit this file when you need to:
- Add new app-specific components
- Modify existing layouts
- Add page-specific styles
- Implement new features or screens

### Best Practices

1. **Use design tokens** - Always reference variables from design-system.css
2. **Follow BEM naming** - Use Block__Element--Modifier convention where applicable
3. **Keep specificity low** - Avoid deep nesting and overly specific selectors
4. **Mobile-first** - Start with mobile styles and add breakpoints as needed

## Benefits of This Architecture

### 1. Separation of Concerns
- Design system changes don't affect app-specific code
- App features can evolve independently of the design foundation

### 2. Reduced Duplication
- Eliminated 253 lines of duplicate CSS variable definitions
- Single source of truth for design tokens

### 3. Better Maintainability
- Easier to find and update specific styles
- Clear organization improves team collaboration
- Faster onboarding for new developers

### 4. Improved Performance
- Browser can cache design system separately from app styles
- Smaller individual file sizes load faster

### 5. Scalability
- Easy to add new components following established patterns
- Design system can be shared across multiple apps
- Consistent theming and branding

## Theme Customization

To customize the theme, modify the CSS custom properties in `design-system.css`:

### Changing Primary Color

```css
:root {
  --color-primary: var(--color-teal-500);  /* Change this */
  --color-primary-hover: var(--color-teal-600);
  --color-primary-active: var(--color-teal-700);
}
```

### Adding a New Color Token

```css
:root {
  /* 1. Add primitive color */
  --color-purple-500: rgba(147, 51, 234, 1);
  --color-purple-500-rgb: 147, 51, 234;
  
  /* 2. Use in semantic token if needed */
  --color-accent: var(--color-purple-500);
}

/* 3. Update dark mode if applicable */
@media (prefers-color-scheme: dark) {
  :root {
    --color-purple-400: rgba(167, 139, 250, 1);
    --color-accent: var(--color-purple-400);
  }
}
```

### Adjusting Spacing Scale

```css
:root {
  /* Add a new spacing value */
  --space-40: 40px;
  --space-48: 48px;
}
```

## Migration Notes

### From Old Structure
- **Before:** Single `style.css` with 2,210 lines and duplication
- **After:** Split into two files with 1,993 total lines (10% reduction)

### Backward Compatibility
- The original `style.css` is preserved for reference
- All existing class names and selectors remain unchanged
- No JavaScript changes required

### Future Considerations
- Consider removing the old `style.css` once the split is verified in production
- Monitor CSS file sizes as the app grows
- Consider CSS minification for production builds
- Explore CSS-in-JS or utility-first frameworks if complexity increases

## Troubleshooting

### Styles Not Applied
**Problem:** Some styles appear broken or missing.

**Solution:** Ensure both CSS files are included and in the correct order:
```html
<link rel="stylesheet" href="design-system.css">  <!-- First -->
<link rel="stylesheet" href="app.css">             <!-- Second -->
```

### Dark Mode Not Working
**Problem:** Dark mode doesn't activate.

**Solution:** Check that:
1. Your OS/browser is set to dark mode for automatic detection
2. Or the `data-color-scheme="dark"` attribute is set on a parent element for manual switching

### Missing Design Token
**Problem:** A CSS variable is undefined.

**Solution:** Add the token to `design-system.css` in the `:root` block and update theme variants if needed.

## Contributing

When adding new styles:

1. **Determine the appropriate file:**
   - Is it a design token or reusable component? → `design-system.css`
   - Is it app-specific? → `app.css`

2. **Follow naming conventions:**
   - Design tokens: `--category-name-variant` (e.g., `--color-teal-500`)
   - Component classes: BEM notation (e.g., `.card__header--highlighted`)

3. **Test in both themes:**
   - Verify light mode appearance
   - Verify dark mode appearance
   - Check manual theme switching

4. **Document complex additions:**
   - Add comments for non-obvious code
   - Update this documentation if architecture changes

---

**Last Updated:** 2025-01-12  
**Total CSS Lines:** 1,993 (754 design system + 1,239 app)  
**Reduction from Original:** 217 lines (10%)
