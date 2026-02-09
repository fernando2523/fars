import Items from "./menu";

export const buildPageTitleMap = () => {
    const map: Record<string, string> = {};

    const traverse = (items: any[]) => {
        items.forEach((item) => {
            if (item.href && item.href.startsWith("/")) {
                map[item.href] = item.title?.toUpperCase();
            }

            if (item.children && Array.isArray(item.children)) {
                traverse(item.children);
            }
        });
    };

    traverse(Items);
    return map;
};