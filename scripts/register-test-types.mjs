import {registerHooks} from 'node:module';

// Use Node 22.18+ TypeScript stripping, matching the Node 22 Docker runtime.
registerHooks({
  resolve(specifier,context,nextResolve) {
    if(specifier.startsWith('@/')) {
      return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`,import.meta.url).href,context);
    }
    try {
      return nextResolve(specifier,context);
    } catch(error) {
      if(error.code!=='ERR_MODULE_NOT_FOUND') throw error;
      if(specifier.startsWith('.')) return nextResolve(`${specifier}.ts`,context);
      if(specifier.startsWith('next/')) return nextResolve(`${specifier}.js`,context);
      throw error;
    }
  },
});
