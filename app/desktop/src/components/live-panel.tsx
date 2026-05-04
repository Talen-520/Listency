import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export function LivePanel({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 pr-3">
          {items.length === 0 ? (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">{empty}</div>
          ) : (
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-md border bg-background px-3 py-2 text-sm leading-6 text-muted-foreground">
                  {item}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
