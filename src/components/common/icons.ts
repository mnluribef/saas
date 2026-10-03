export type IconName =
    | 'flame'
    | 'zap'
    | 'message-circle'
    | 'users'
    | 'shield-check'
    | 'truck'
    | 'file-text'
    | 'sparkles'
    | 'ruler'
    | 'package-check'
    | 'repeat'
    | 'cpu'
    | 'box'
    | 'check'
    | 'check-circle'
    | 'chevron-right'
    | 'chevron-left'
    | 'trash'
    | 'search'
    | 'close'
    | 'cart'
    | 'star'
    | 'help-circle'
    | 'alert-circle'
    | 'x-circle'
    | 'user'
    | 'package'
    | 'image'
    | 'whatsapp'
    | 'map-pin';

export interface IconDefinition {
    body: string;
    viewBox?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number | string;
}

export const ICONS: Record<IconName, IconDefinition> = {
    flame: {
        body: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    },
    zap: {
        body: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    },
    'message-circle': {
        body: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    },
    users: {
        body: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    },
    'shield-check': {
        body: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
    },
    truck: {
        body: '<rect width="16" height="13" x="1" y="3" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    },
    'file-text': {
        body: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>',
    },
    sparkles: {
        body: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>',
    },
    ruler: {
        body: '<path d="M21.3 15.3l-6.6-6.6a2 2 0 0 0-2.8 0L2.7 17.9a2 2 0 0 0 0 2.8l3.4 3.4a2 2 0 0 0 2.8 0l9.2-9.2a2 2 0 0 0 0-2.8l-1.4-1.4"/><path d="m14 7 3 3"/><path d="m11 10 2 2"/><path d="m8 13 2 2"/><path d="m5 16 3 3"/>',
    },
    'package-check': {
        body: '<path d="m16 16 2 2 4-4"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/>',
    },
    repeat: {
        body: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    },
    cpu: {
        body: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
    },
    box: {
        body: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    },
    check: {
        body: '<polyline points="20 6 9 17 4 12"/>',
    },
    'check-circle': {
        body: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    },
    'chevron-right': {
        body: '<path d="m9 18 6-6-6-6"/>',
    },
    'chevron-left': {
        body: '<path d="m15 18-6-6 6-6"/>',
    },
    trash: {
        body: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    },
    search: {
        body: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    },
    close: {
        body: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    },
    cart: {
        body: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    },
    star: {
        body: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
        fill: 'currentColor',
    },
    'help-circle': {
        body: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    },
    'alert-circle': {
        body: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    },
    'x-circle': {
        body: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    },
    user: {
        body: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    },
    package: {
        body: '<path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>',
    },
    image: {
        body: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    },
    whatsapp: {
        body: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    },
    'map-pin': {
        body: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    },
};

export interface IconRenderOptions {
    size?: number | string;
    width?: number | string;
    height?: number | string;
    stroke?: string;
    fill?: string;
    strokeWidth?: number | string;
    class?: string;
    style?: string;
}

export function getIcon(name: string): IconDefinition {
    const iconKey = name.toLowerCase().trim() as IconName;
    return ICONS[iconKey] || ICONS['check-circle'];
}

export function renderIconSvg(name: string, options: IconRenderOptions = {}): string {
    const icon = getIcon(name);
    const size = options.size || 24;
    const width = options.width || size;
    const height = options.height || size;
    const stroke = options.stroke || icon.stroke || 'currentColor';
    const fill = options.fill || icon.fill || 'none';
    const strokeWidth = options.strokeWidth || icon.strokeWidth || 2;
    const viewBox = icon.viewBox || '0 0 24 24';
    const className = options.class ? ` class="${options.class}"` : '';
    const styleAttr = options.style ? ` style="${options.style}"` : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${className}${styleAttr}>${icon.body}</svg>`;
}
