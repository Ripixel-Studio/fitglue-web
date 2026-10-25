# Handlebars Templates

The marketing site uses **Handlebars** as its template engine. This document covers template structure, partials, and data injection patterns.

## Template Structure

### Basic Page Template

```html
{{> header}}

<main>
  <section class="hero">
    <div class="container">
      <h1>{{pageTitle}}</h1>
      <p>{{description}}</p>
    </div>
  </section>
</main>

{{> footer}}
```

### Conditional Content

```html
{{#if isHome}}
  <section class="hero-home">...</section>
{{else}}
  <section class="hero-page">...</section>
{{/if}}
```

### Iteration

```html
{{#each features}}
  <div class="feature-card">
    <h3>{{this.title}}</h3>
    <p>{{this.description}}</p>
  </div>
{{/each}}
```

## Partials

Partials are reusable template fragments in the `partials/` directory.

### header.html

The main site header with navigation:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{pageTitle}} | {{siteName}}</title>
  <meta name="description" content="{{description}}">

  <!-- Open Graph -->
  <meta property="og:title" content="{{pageTitle}} | {{siteName}}">
  <meta property="og:description" content="{{description}}">

  <!-- Styles -->
  <link rel="stylesheet" href="/styles.min.{{cacheHash}}.css">
</head>
<body>
  <header class="site-header">
    <nav>
      <a href="/" class="logo">{{siteName}}</a>
      <ul class="nav-links">
        <li><a href="/features" {{#if isFeatures}}class="active"{{/if}}>Features</a></li>
        <li><a href="{{appUrl}}">Dashboard</a></li>
      </ul>
    </nav>
  </header>
```

### footer.html

Site footer with links and copyright:

```html
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-section">
          <h4>Product</h4>
          <ul>
            <li><a href="/features">Features</a></li>
          </ul>
        </div>
        <!-- More sections -->
      </div>
      <p class="copyright">&copy; {{year}} {{siteName}}</p>
    </div>
  </footer>
</body>
</html>
```

### auth-head.html / auth-footer.html

Minimal partials for auth pages (login, register, etc.):

```html
<!-- auth-head.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <title>{{pageTitle}} | {{siteName}}</title>
  <link rel="stylesheet" href="/styles.min.{{cacheHash}}.css">
</head>
<body class="auth-page">

<!-- auth-footer.html -->
</body>
</html>
```

## Dynamic Templates

Templates in `templates/` are used for registry-driven pages.

### plugin-detail.html

Template for individual plugin (booster) pages:

```html
{{> header}}

<main class="plugin-detail">
  <section class="hero">
    <div class="container">
      <span class="badge">{{category}}</span>
      <h1>{{name}}</h1>
      <p class="tagline">{{tagline}}</p>
    </div>
  </section>

  <section class="description">
    <div class="container">
      {{{descriptionHtml}}}
    </div>
  </section>

  {{#if features}}
  <section class="features">
    <div class="container">
      <h2>Features</h2>
      <ul class="feature-list">
        {{#each features}}
          <li>{{this}}</li>
        {{/each}}
      </ul>
    </div>
  </section>
  {{/if}}
</main>

{{> footer}}
```

### connection-detail.html

Template for connection (source/target) pages:

```html
{{> header}}

<main class="connection-detail">
  <section class="hero">
    <img src="{{iconUrl}}" alt="{{name}} logo" class="connection-icon">
    <h1>{{name}}</h1>
    <span class="badge {{type}}">{{type}}</span>
  </section>

  <section class="integration-guide">
    {{{integrationHtml}}}
  </section>
</main>

{{> footer}}
```

## Data Injection

### Global Variables

Set via `setGlobalsTask` in `skier.tasks.mjs`:

```javascript
setGlobalsTask({
  values: {
    siteName: 'FitGlue',
    siteUrl: 'https://fitglue.com/',
    year: new Date().getFullYear(),
    cacheHash,
    appUrl: '/app',
  },
}),
```

Available in all templates:
- `{{siteName}}` → "FitGlue"
- `{{year}}` → "2026"
- `{{cacheHash}}` → "abc123"

### Page Variables

Set via `additionalVarsFn` in `generatePagesTask`:

```javascript
generatePagesTask({
  pagesDir: './pages',
  additionalVarsFn: ({ currentPage }) => {
    const descriptions = {
      index: 'Watch your workout become extraordinary...',
      features: 'Connect everywhere, enhance everything...',
    };

    return {
      pageTitle: currentPage.charAt(0).toUpperCase() + currentPage.slice(1),
      isHome: currentPage === 'index',
      isFeatures: currentPage === 'features',
      description: descriptions[currentPage] || 'Default description',
    };
  },
}),
```

### Dynamic Page Data

For registry-driven pages, data comes from the transformed registry:

```javascript
// generateDynamicPagesTask processes each item:
{
  name: 'Muscle Heatmap',
  slug: 'muscle-heatmap',
  category: 'booster',
  tagline: 'Visualize which muscles you trained',
  descriptionHtml: '<p>See your workout intensity...</p>',
  features: ['Visual heatmap', 'Muscle groups', 'Intensity levels'],
}
```

## SEO Metadata

Each page should include proper metadata:

```html
<head>
  <!-- Primary Meta -->
  <title>{{pageTitle}} | {{siteName}}</title>
  <meta name="description" content="{{description}}">

  <!-- Canonical URL -->
  <link rel="canonical" href="{{siteUrl}}{{canonicalPath}}">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="{{siteUrl}}{{canonicalPath}}">
  <meta property="og:title" content="{{pageTitle}} | {{siteName}}">
  <meta property="og:description" content="{{description}}">
  <meta property="og:image" content="{{siteUrl}}/images/og-image.png">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{{pageTitle}} | {{siteName}}">
  <meta name="twitter:description" content="{{description}}">
</head>
```

Descriptions are defined per-page in `additionalVarsFn`:

```javascript
const descriptions = {
  index: 'Watch your workout become extraordinary...',
  features: 'Connect everywhere, enhance everything...',
  // ...
};
```

## Active Navigation

Use page flags to highlight the current page:

```html
<nav>
  <a href="/features" {{#if isFeatures}}class="active"{{/if}}>Features</a>
  <a href="/how-it-works" {{#if isHowItWorks}}class="active"{{/if}}>How It Works</a>
</nav>
```

Flags are set in `additionalVarsFn`:

```javascript
return {
  isHome: currentPage === 'index',
  isFeatures: currentPage === 'features',
  isHowItWorks: currentPage === 'how-it-works',
};
```

## HTML Escaping

By default, Handlebars escapes HTML. Use triple braces for raw HTML:

```html
<!-- Escaped (safe) -->
{{title}}  → &lt;script&gt;alert('xss')&lt;/script&gt;

<!-- Unescaped (raw HTML) -->
{{{descriptionHtml}}}  → <p>Formatted <strong>content</strong></p>
```

> ⚠️ Only use `{{{triple}}}` for trusted content (e.g., pre-rendered markdown).

## Related Documentation

- [Skier Pipeline](./skier-pipeline.md)
- [Content Management](./content.md)
- [Architecture Overview](../architecture/overview.md)
