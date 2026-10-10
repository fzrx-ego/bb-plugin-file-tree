import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { MENU_ITEM_LAST_HOVERED_CLASS, MenuHoverProvider, useMenuItemHover } from "@/components/ui/menu-item-hover";
import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { cn, formatHomePathForDisplay } from "@/lib/utils";
import type { RootChoice } from "../contract";

/**
 * The pinned-folder picker. A native `<select>` draws each option as one run
 * of text, so the project name and its path blur together; this menu sets the
 * name in bold and the path after it in muted text.
 */
export function RootPicker({
  choices,
  selectedId,
  onSelect,
}: {
  choices: RootChoice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const portalScopeProps = usePortalScopeProps();
  const chosen = choices.find((choice) => choice.id === selectedId);
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label="File tree folder"
        title={chosen === undefined ? "Choose a folder" : `${chosen.label} · ${chosen.workspace.rootPath}`}
        className="flex h-7 min-w-0 max-w-full cursor-default items-center gap-1 rounded-md pl-2 pr-1.5 text-sm font-medium text-sidebar-foreground outline-none hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-state-hover"
      >
        <span className="min-w-0 truncate">{chosen?.label ?? "Choose a folder"}</span>
        <Icon name="ChevronDown" className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...portalScopeProps}
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="z-[70] max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] min-w-56 max-w-[min(36rem,calc(100vw-1rem))] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
        >
          <MenuHoverProvider>
            {choices.map((choice) => (
              <RootPickerItem
                key={choice.id}
                choice={choice}
                isSelected={choice.id === selectedId}
                onSelect={() => onSelect(choice.id)}
              />
            ))}
          </MenuHoverProvider>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function RootPickerItem({
  choice,
  isSelected,
  onSelect,
}: {
  choice: RootChoice;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { hoverProps } = useMenuItemHover();
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      title={choice.workspace.rootPath}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-[0.3125rem] text-xs outline-none focus:bg-state-hover focus:text-foreground",
        LIST_HOVER_TRANSITION,
        MENU_ITEM_LAST_HOVERED_CLASS,
      )}
      {...hoverProps}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {isSelected ? <Icon name="Check" className="size-3.5" /> : null}
      </span>
      <span className="min-w-0 truncate">
        <span className="font-semibold">{choice.label}</span>
        <span className="ml-1.5 text-muted-foreground">{formatHomePathForDisplay(choice.workspace.rootPath)}</span>
      </span>
    </DropdownMenu.Item>
  );
}
