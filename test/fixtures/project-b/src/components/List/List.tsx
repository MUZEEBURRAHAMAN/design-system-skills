export interface ListProps { dense?: boolean }
export interface ListItemProps { active?: boolean }
export function List(props: ListProps) { return <ul />; }
export function ListItem(props: ListItemProps) { return <li />; }
