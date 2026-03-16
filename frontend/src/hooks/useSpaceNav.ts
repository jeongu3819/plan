/**
 * useSpaceNav — Space-aware navigation hook.
 *
 * All navigation in the app should go through this hook to ensure
 * paths are prefixed with the current space slug.
 *
 * Example: spaceNav('/project/1') → navigates to '/space/DA파트/project/1'
 */

import { useNavigate, useParams } from 'react-router-dom';
import { useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';

export function useSpaceSlug(): string {
  const params = useParams<{ spaceSlug?: string }>();
  return params.spaceSlug || '';
}

export function useSpaceNav() {
  const navigate = useNavigate();
  const params = useParams<{ spaceSlug?: string }>();
  const storeSpaceSlug = useAppStore(state => state.currentSpaceSlug);

  const spaceSlug = params.spaceSlug || storeSpaceSlug || '';

  const spaceNav = useCallback(
    (path: string, options?: { replace?: boolean }) => {
      if (spaceSlug) {
        navigate(`/space/${spaceSlug}${path}`, options);
      } else {
        navigate(path, options);
      }
    },
    [navigate, spaceSlug]
  );

  const spacePath = useCallback(
    (path: string) => {
      if (spaceSlug) return `/space/${spaceSlug}${path}`;
      return path;
    },
    [spaceSlug]
  );

  return { spaceNav, spacePath, spaceSlug, navigate };
}
