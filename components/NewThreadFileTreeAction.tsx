import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { writeStoredOpen } from "@/lib/rail-state";

export function NewThreadFileTreeAction() {
  return (
    <Button type="button" variant="ghost" size="icon" className="size-7"
      aria-label="Show file tree" onClick={() => writeStoredOpen(true)}>
      <Icon name="FolderTree" className="size-4" />
    </Button>
  );
}
