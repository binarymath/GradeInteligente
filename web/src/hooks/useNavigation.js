import { useState, useEffect } from 'react';

export function useNavigation() {
    // Restore navigation from localStorage
    const getInitialNav = () => {
        try {
            const raw = localStorage.getItem('app_nav');
            if (raw) {
                const parsed = JSON.parse(raw);
                return {
                    view: parsed.view || 'about',
                    subView: parsed.subView || 'teachers',
                    viewMode: parsed.viewMode || 'class',
                    selectedEntity: parsed.selectedEntity || '',
                    sidebarOpen: false // Always start collapsed
                };
            }
        } catch (e) {
            // ignore
        }
        return { view: 'about', subView: 'subjects', viewMode: 'class', selectedEntity: '', sidebarOpen: false };
    };

    const initialNav = getInitialNav();

    const [view, setView] = useState(initialNav.view);
    const [subView, setSubView] = useState(initialNav.subView);
    const [sidebarOpen, setSidebarOpen] = useState(initialNav.sidebarOpen);
    const [viewMode, setViewMode] = useState(initialNav.viewMode);
    const [selectedEntities, setSelectedEntities] = useState(
        Array.isArray(initialNav.selectedEntity)
            ? initialNav.selectedEntity
            : (initialNav.selectedEntity ? [initialNav.selectedEntity] : [])
    );

    // Mobile detection
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 1024;
            setIsMobile(mobile);
            if (mobile) setSidebarOpen(false);
            // Desktop doesn't auto-collapse on resize, only on init logic if desired
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Persistence
    useEffect(() => {
        try {
            const nav = {
                view,
                subView,
                viewMode,
                selectedEntity: selectedEntities[0] || '', // Backwards compatibility
                sidebarOpen
            };
            localStorage.setItem('app_nav', JSON.stringify(nav));
        } catch (e) {
            // ignore
        }
    }, [view, subView, viewMode, selectedEntities, sidebarOpen]);

    return {
        view, setView,
        subView, setSubView,
        sidebarOpen, setSidebarOpen,
        viewMode, setViewMode,
        selectedEntities, setSelectedEntities,
        isMobile
    };
}
