import type { AuthProfile } from '@anderp/shared';
import { ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { switchOrganization } from '@/lib/auth-api';
import { errorMessage } from '@/lib/error-messages.es';
import { announceSwitch, goHome } from '@/lib/organization-switch';

/** F20: nombre de la organización en la cabecera; con dos o más, menú para cambiar de una a otra. */
export function OrganizationSwitcher({ user }: { user: AuthProfile }) {
  const { organization, organizations } = user;
  if (organizations.length < 2) {
    return <span className="truncate text-sm text-muted-foreground">{organization.name}</span>;
  }

  const handleSelect = (organizationId: string) => {
    if (organizationId === organization.id) return;
    switchOrganization(organizationId)
      .then(() => {
        announceSwitch();
        goHome();
      })
      .catch((e: unknown) => toast.error(errorMessage(e)));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="min-w-0 text-muted-foreground">
          <span className="truncate">{organization.name}</span>
          <ChevronsUpDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[calc(100vw-2rem)]">
        {organizations.map(({ id, name }) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={id === organization.id}
            onSelect={() => {
              handleSelect(id);
            }}
          >
            <span className="truncate">{name}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
