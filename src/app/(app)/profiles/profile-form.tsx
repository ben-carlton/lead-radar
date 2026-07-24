import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ProfileFormValues = {
  name: string;
  productsSold: string;
  industriesTargeted: string[];
  buyerRoles: string[];
  regions: string[];
  signalKeywords: string[];
  excludeKeywords: string[];
  isActive: boolean;
};

export function ProfileForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultValues?: Partial<ProfileFormValues>;
  submitLabel: string;
}) {
  const list = (values: string[] | undefined) => values?.join(", ") ?? "";

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Profile name</Label>
        <Input id="name" name="name" defaultValue={defaultValues?.name} required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="productsSold">What do you sell?</Label>
        <Textarea
          id="productsSold"
          name="productsSold"
          defaultValue={defaultValues?.productsSold}
          placeholder="Rotary screw air compressors, VSD compressors, portable diesel compressors"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="industriesTargeted">Industries targeted</Label>
        <Input
          id="industriesTargeted"
          name="industriesTargeted"
          defaultValue={list(defaultValues?.industriesTargeted)}
          placeholder="Manufacturing, food processing, packaging"
        />
        <p className="text-muted-foreground text-xs">Comma-separated.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="buyerRoles">Buyer roles</Label>
        <Input
          id="buyerRoles"
          name="buyerRoles"
          defaultValue={list(defaultValues?.buyerRoles)}
          placeholder="Maintenance Manager, Plant Manager"
        />
        <p className="text-muted-foreground text-xs">Comma-separated.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="regions">Regions covered</Label>
        <Input
          id="regions"
          name="regions"
          defaultValue={list(defaultValues?.regions)}
          placeholder="Brisbane Southside, Logan, Ipswich"
        />
        <p className="text-muted-foreground text-xs">Comma-separated.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="signalKeywords">Signal keywords</Label>
        <Input
          id="signalKeywords"
          name="signalKeywords"
          defaultValue={list(defaultValues?.signalKeywords)}
          placeholder="new facility, expansion, greenfield, capex"
        />
        <p className="text-muted-foreground text-xs">Comma-separated.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="excludeKeywords">Exclude keywords</Label>
        <Input
          id="excludeKeywords"
          name="excludeKeywords"
          defaultValue={list(defaultValues?.excludeKeywords)}
        />
        <p className="text-muted-foreground text-xs">Comma-separated.</p>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="isActive" name="isActive" defaultChecked={defaultValues?.isActive ?? true} />
        <Label htmlFor="isActive">Active</Label>
      </div>

      <Button type="submit" className="w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}
