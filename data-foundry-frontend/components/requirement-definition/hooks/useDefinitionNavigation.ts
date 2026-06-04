"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  parseDefinitionSectionHash,
  resolveActiveDefinitionSection,
  type DefinitionSectionId,
} from "@/lib/requirement-definition-navigation";

type ScrollContainer = Window | HTMLElement;

function isWindowScrollContainer(container: ScrollContainer): container is Window {
  return container === window;
}

function resolveScrollContainer(): ScrollContainer {
  const main = document.querySelector("main");
  if (!(main instanceof HTMLElement)) {
    return window;
  }

  const mainStyle = window.getComputedStyle(main);
  const mainAllowsScroll = mainStyle.overflowY === "auto" || mainStyle.overflowY === "scroll";
  const mainIsActuallyScrollable = mainAllowsScroll && main.scrollHeight > main.clientHeight;
  const documentIsScrollable =
    document.documentElement.scrollHeight > document.documentElement.clientHeight
    || document.body.scrollHeight > document.body.clientHeight;

  return mainIsActuallyScrollable && !documentIsScrollable ? main : window;
}

function getScrollContainerViewportTop(container: ScrollContainer): number {
  return isWindowScrollContainer(container) ? 0 : container.getBoundingClientRect().top;
}

function getScrollContainerOffset(container: ScrollContainer): number {
  return isWindowScrollContainer(container) ? window.scrollY : container.scrollTop;
}

function scrollContainerTo(container: ScrollContainer, top: number, behavior: ScrollBehavior) {
  if (isWindowScrollContainer(container)) {
    window.scrollTo({ top, behavior });
    return;
  }
  container.scrollTo({ top, behavior });
}

const definitionNavTopOffset = 0;

type Args = {
  entryGuide?: string;
  visibleDefinitionSectionIds: readonly DefinitionSectionId[];
};

export function useDefinitionNavigation({
  entryGuide,
  visibleDefinitionSectionIds,
}: Args) {
  const [activeSection, setActiveSection] = useState<DefinitionSectionId>("business-definition");
  const [isNavPinned, setIsNavPinned] = useState(false);
  const [highlightedSections, setHighlightedSections] = useState<DefinitionSectionId[]>([]);
  const [navFrame, setNavFrame] = useState<{ top: number; left: number; width: number; height: number }>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  });
  const navShellRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const pendingNavigationRef = useRef<{ sectionId: DefinitionSectionId; targetTop: number } | null>(null);
  const pendingNavigationTimeoutRef = useRef<number | null>(null);

  const scrollToSection = (sectionId: DefinitionSectionId, behavior: ScrollBehavior = "smooth") => {
    if (!visibleDefinitionSectionIds.includes(sectionId)) {
      return;
    }

    const section = document.getElementById(sectionId);
    if (!section) {
      return;
    }

    const scrollContainer = resolveScrollContainer();
    const navShell = navShellRef.current;
    const navHeight = navRef.current?.offsetHeight ?? 0;
    const gap = 16;
    const containerTop = getScrollContainerViewportTop(scrollContainer);
    const currentScrollTop = getScrollContainerOffset(scrollContainer);
    const sectionTop = currentScrollTop + section.getBoundingClientRect().top - containerTop;
    const navShellTop = navShell
      ? currentScrollTop + navShell.getBoundingClientRect().top - containerTop
      : sectionTop;
    const targetTop = sectionId === visibleDefinitionSectionIds[0]
      ? navShellTop - definitionNavTopOffset
      : Math.max(navShellTop - definitionNavTopOffset, sectionTop - navHeight - gap - definitionNavTopOffset);
    const nextTargetTop = Math.max(0, targetTop);

    pendingNavigationRef.current = { sectionId, targetTop: nextTargetTop };
    if (pendingNavigationTimeoutRef.current != null) {
      window.clearTimeout(pendingNavigationTimeoutRef.current);
    }
    pendingNavigationTimeoutRef.current = window.setTimeout(() => {
      pendingNavigationRef.current = null;
      pendingNavigationTimeoutRef.current = null;
    }, 700);

    window.history.replaceState(null, "", `#${sectionId}`);
    scrollContainerTo(scrollContainer, nextTargetTop, behavior);
    setActiveSection(sectionId);
  };

  const handleSectionNavigation = (sectionId: DefinitionSectionId) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    scrollToSection(sectionId, "smooth");
  };

  useEffect(() => {
    const clearPendingNavigation = () => {
      pendingNavigationRef.current = null;
      if (pendingNavigationTimeoutRef.current != null) {
        window.clearTimeout(pendingNavigationTimeoutRef.current);
        pendingNavigationTimeoutRef.current = null;
      }
    };

    const scrollContainer = resolveScrollContainer();
    const scrollEventTarget = isWindowScrollContainer(scrollContainer) ? window : scrollContainer;
    const resolveActiveSection = () => {
      const anchorOffset = (navRef.current?.offsetHeight ?? 0) + 16;
      const containerTop = getScrollContainerViewportTop(scrollContainer);
      const currentScrollTop = getScrollContainerOffset(scrollContainer);
      const pendingNavigation = pendingNavigationRef.current;

      if (pendingNavigation) {
        if (Math.abs(currentScrollTop - pendingNavigation.targetTop) <= 8) {
          clearPendingNavigation();
        } else {
          setActiveSection((current) => (
            current === pendingNavigation.sectionId ? current : pendingNavigation.sectionId
          ));
          return;
        }
      }

      const sectionViewportTops = visibleDefinitionSectionIds.reduce<Partial<Record<DefinitionSectionId, number>>>(
        (accumulator, sectionId) => {
          const section = document.getElementById(sectionId);
          if (!section) {
            return accumulator;
          }

          accumulator[sectionId] = section.getBoundingClientRect().top - containerTop;
          return accumulator;
        },
        {},
      );
      const nextActiveSection = resolveActiveDefinitionSection(
        sectionViewportTops,
        anchorOffset,
        undefined,
        visibleDefinitionSectionIds,
      );

      setActiveSection((current) => (current === nextActiveSection ? current : nextActiveSection));
    };

    resolveActiveSection();
    scrollEventTarget.addEventListener("scroll", resolveActiveSection, { passive: true });
    window.addEventListener("resize", resolveActiveSection);

    return () => {
      clearPendingNavigation();
      scrollEventTarget.removeEventListener("scroll", resolveActiveSection);
      window.removeEventListener("resize", resolveActiveSection);
    };
  }, [visibleDefinitionSectionIds]);

  useEffect(() => {
    const scrollContainer = resolveScrollContainer();
    const scrollEventTarget = isWindowScrollContainer(scrollContainer) ? window : scrollContainer;
    const resolveNavFrame = () => {
      const navShell = navShellRef.current;
      const nav = navRef.current;
      if (!navShell || !nav) {
        return;
      }

      const shellRect = navShell.getBoundingClientRect();
      const containerTop = getScrollContainerViewportTop(scrollContainer);
      const nextPinned = shellRect.top <= containerTop + definitionNavTopOffset;
      const nextFrame = {
        top: containerTop + definitionNavTopOffset,
        left: shellRect.left,
        width: shellRect.width,
        height: nav.offsetHeight,
      };

      setIsNavPinned((current) => (current === nextPinned ? current : nextPinned));
      setNavFrame((current) =>
        current.top === nextFrame.top &&
        current.left === nextFrame.left &&
        current.width === nextFrame.width &&
        current.height === nextFrame.height
          ? current
          : nextFrame,
      );
    };

    resolveNavFrame();
    scrollEventTarget.addEventListener("scroll", resolveNavFrame, { passive: true });
    window.addEventListener("resize", resolveNavFrame);

    return () => {
      scrollEventTarget.removeEventListener("scroll", resolveNavFrame);
      window.removeEventListener("resize", resolveNavFrame);
    };
  }, []);

  useEffect(() => {
    const applyHashSectionNavigation = (behavior: ScrollBehavior = "auto") => {
      const targetSection = parseDefinitionSectionHash(window.location.hash);
      if (!targetSection || !visibleDefinitionSectionIds.includes(targetSection)) {
        return;
      }

      window.requestAnimationFrame(() => {
        scrollToSection(targetSection, behavior);
      });
    };

    applyHashSectionNavigation("auto");

    const handleHashChange = () => {
      applyHashSectionNavigation("smooth");
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [visibleDefinitionSectionIds]);

  useEffect(() => {
    if (entryGuide !== "production-scope") {
      return;
    }

    const targetSection: DefinitionSectionId = "scope-generation";
    setHighlightedSections(["scope-generation", "data-update"]);
    const frameId = window.requestAnimationFrame(() => {
      scrollToSection(targetSection, "smooth");
    });
    const timeoutId = window.setTimeout(() => {
      setHighlightedSections([]);
    }, 5000);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [entryGuide, visibleDefinitionSectionIds]);

  const activeSectionIndex = useMemo(() => {
    const normalizedActiveSection = visibleDefinitionSectionIds.includes(activeSection)
      ? activeSection
      : visibleDefinitionSectionIds[0];
    return Math.max(0, visibleDefinitionSectionIds.indexOf(normalizedActiveSection));
  }, [activeSection, visibleDefinitionSectionIds]);

  return {
    activeSection,
    activeSectionIndex,
    isNavPinned,
    highlightedSections,
    navFrame,
    navShellRef,
    navRef,
    scrollToSection,
    handleSectionNavigation,
  };
}
