declare module 'react-grid-layout' {
    import * as React from 'react';

    export interface Layout {
        i: string;
        x: number;
        y: number;
        w: number;
        h: number;
        minW?: number;
        minH?: number;
        maxW?: number;
        maxH?: number;
        static?: boolean;
        isDraggable?: boolean;
        isResizable?: boolean;
    }

    export interface ReactGridLayoutProps {
        className?: string;
        style?: React.CSSProperties;
        layout?: Layout[];
        cols?: number;
        rowHeight?: number;
        width?: number;
        autoSize?: boolean;
        isDraggable?: boolean;
        isResizable?: boolean;
        compactType?: 'vertical' | 'horizontal' | null;
        margin?: [number, number];
        containerPadding?: [number, number];
        draggableHandle?: string;
        draggableCancel?: string;
        onLayoutChange?: (layout: Layout[]) => void;
        onDragStart?: (...args: any[]) => void;
        onDrag?: (...args: any[]) => void;
        onDragStop?: (...args: any[]) => void;
        children?: React.ReactNode;
    }

    export interface ResponsiveProps extends ReactGridLayoutProps {
        breakpoints?: { [key: string]: number };
        layouts?: { [key: string]: Layout[] };
        onBreakpointChange?: (breakpoint: string, cols: number) => void;
        onLayoutChange?: (layout: Layout[], layouts?: { [key: string]: Layout[] }) => void;
    }

    export class Responsive extends React.Component<ResponsiveProps> { }
    export function WidthProvider<P extends object>(component: React.ComponentType<P>): React.ComponentType<P>;

    const ReactGridLayout: React.ComponentType<ReactGridLayoutProps>;
    export default ReactGridLayout;
}
