import { CalendarClock, Database, Plus, Sparkles, Trash2 } from "lucide-react";

import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import type { BusinessHoursConfig, BusinessHoursStatus, BusinessInfoSections, BusinessProfile } from "@/lib/types";

const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

const timezoneOptions = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

const afterHoursModes = [
  { value: "take_callback", label: "Take Callback" },
  { value: "information_only", label: "Information Only" },
  { value: "transfer", label: "Transfer" },
  { value: "closed_message", label: "Closed Message" },
] as const;

const businessTypeOptions = [
  { value: "general", labelKey: "businessTypes.general", fallback: "General" },
  { value: "hotel", labelKey: "businessTypes.hotel", fallback: "Hotel / Inn" },
  { value: "restaurant", labelKey: "businessTypes.restaurant", fallback: "Restaurant / Cafe" },
  { value: "appointment", labelKey: "businessTypes.appointment", fallback: "Appointment Business" },
] as const;

type BusinessInfoFieldKey = Exclude<keyof BusinessInfoSections, "business_type">;

const businessInfoFieldKeys = [
  "location",
  "services",
  "pricing",
  "booking_rules",
  "policies",
  "faq",
  "parking_accessibility",
] as const satisfies BusinessInfoFieldKey[];

export function BusinessView({
  business,
  businessHours,
  businessHoursStatus,
  businessInfoSections,
  onBusinessChange,
  onBusinessHoursChange,
  onBusinessInfoSectionsChange,
  onSave,
  onSaveBusinessHours,
}: {
  business: BusinessProfile;
  businessHours: BusinessHoursConfig;
  businessHoursStatus: BusinessHoursStatus;
  businessInfoSections: BusinessInfoSections;
  onBusinessChange: (business: BusinessProfile) => void;
  onBusinessHoursChange: (businessHours: BusinessHoursConfig) => void;
  onBusinessInfoSectionsChange: (sections: BusinessInfoSections) => void;
  onSave: () => void;
  onSaveBusinessHours: () => void;
}) {
  const { t } = useI18n();

  const updateDayWindow = (day: string, index: number, field: "open" | "close", value: string) => {
    const windows = businessHours.weekly_hours[day] ?? [];
    const nextWindows = windows.map((window, windowIndex) => (windowIndex === index ? { ...window, [field]: value } : window));
    onBusinessHoursChange({
      ...businessHours,
      weekly_hours: {
        ...businessHours.weekly_hours,
        [day]: nextWindows,
      },
    });
  };

  const setDayEnabled = (day: string, enabled: boolean) => {
    onBusinessHoursChange({
      ...businessHours,
      weekly_hours: {
        ...businessHours.weekly_hours,
        [day]: enabled ? [businessHours.weekly_hours[day]?.[0] ?? { open: "09:00", close: "17:00" }] : [],
      },
    });
  };

  const addDayWindow = (day: string) => {
    const windows = businessHours.weekly_hours[day] ?? [];
    onBusinessHoursChange({
      ...businessHours,
      weekly_hours: {
        ...businessHours.weekly_hours,
        [day]: [...windows, { open: "09:00", close: "17:00" }],
      },
    });
  };

  const removeDayWindow = (day: string, index: number) => {
    const windows = businessHours.weekly_hours[day] ?? [];
    onBusinessHoursChange({
      ...businessHours,
      weekly_hours: {
        ...businessHours.weekly_hours,
        [day]: windows.filter((_, windowIndex) => windowIndex !== index),
      },
    });
  };

  const addClosure = () => {
    onBusinessHoursChange({
      ...businessHours,
      closures: [...businessHours.closures, { date: new Date().toISOString().slice(0, 10), reason: "", message: "" }],
    });
  };

  const updateClosure = (index: number, field: "date" | "reason" | "message", value: string) => {
    onBusinessHoursChange({
      ...businessHours,
      closures: businessHours.closures.map((closure, closureIndex) =>
        closureIndex === index ? { ...closure, [field]: value } : closure,
      ),
    });
  };

  const removeClosure = (index: number) => {
    onBusinessHoursChange({
      ...businessHours,
      closures: businessHours.closures.filter((_, closureIndex) => closureIndex !== index),
    });
  };

  const fieldMeta = getBusinessInfoFieldMeta(businessInfoSections.business_type, t);
  const bookingRequirements = getBookingRequirementItems(businessInfoSections.business_type, t);
  const applyBusinessInfoTemplate = () => {
    const template = getBusinessInfoTemplate(businessInfoSections.business_type, t);
    const nextSections = { ...businessInfoSections };
    for (const key of businessInfoFieldKeys) {
      if (!nextSections[key].trim()) {
        nextSections[key] = template[key];
      }
    }
    onBusinessInfoSectionsChange(nextSections);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("business.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("business.description")}</p>
      </div>
      <Separator />
      <div className="space-y-4">
        <Field label={t("business.name")}>
          <Input value={business.name} onChange={(event) => onBusinessChange({ ...business, name: event.target.value })} />
        </Field>
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <Field label={t("businessSections.businessType", "Business Type")}>
            <Select
              value={businessInfoSections.business_type}
              onValueChange={(value) =>
                onBusinessInfoSectionsChange({
                  ...businessInfoSections,
                  business_type: value as BusinessInfoSections["business_type"],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {businessTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey, option.fallback)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button variant="outline" onClick={applyBusinessInfoTemplate}>
            <Sparkles className="h-4 w-4" />
            {t("action.applyTemplate", "Apply Template")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("businessSections.typeHint", "Choose the closest business type to tailor examples and required details. Templates fill empty fields only.")}
        </p>
        <div className="rounded-lg bg-muted/40 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-sm font-medium">{t("businessSections.bookingChecklistTitle", "Booking Request Checklist")}</h3>
              <p className="text-sm text-muted-foreground">
                {t(
                  "businessSections.bookingChecklistDescription",
                  "Listency should collect these details before saving a request. Staff still confirms final availability.",
                )}
              </p>
            </div>
            <div className="text-sm text-muted-foreground">{t("businessSections.requestCaptureOnly", "Request capture only")}</div>
          </div>
          <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {bookingRequirements.map((item) => (
              <li key={item} className="rounded-full bg-background px-3 py-2 text-sm text-foreground shadow-sm">
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {businessInfoFieldKeys.slice(0, 6).map((key) => (
            <StructuredField
              key={key}
              label={fieldMeta[key].label}
              description={fieldMeta[key].description}
              placeholder={fieldMeta[key].placeholder}
              value={businessInfoSections[key]}
              onChange={(value) => onBusinessInfoSectionsChange({ ...businessInfoSections, [key]: value })}
            />
          ))}
        </div>
        <StructuredField
          label={fieldMeta.parking_accessibility.label}
          description={fieldMeta.parking_accessibility.description}
          placeholder={fieldMeta.parking_accessibility.placeholder}
          value={businessInfoSections.parking_accessibility}
          onChange={(value) => onBusinessInfoSectionsChange({ ...businessInfoSections, parking_accessibility: value })}
        />
        <Field label={t("business.content")}>
          <p className="mb-2 text-sm text-muted-foreground">
            {t("business.legacyHint", "Optional: keep extra details here. Structured fields above are preferred for accurate tool lookup.")}
          </p>
          <Textarea
            className="min-h-96"
            placeholder={t("business.contentPlaceholder", "Paste any extra details that do not fit the structured sections above.")}
            value={business.content}
            onChange={(event) => onBusinessChange({ ...business, content: event.target.value })}
          />
        </Field>
      </div>
      <Separator />
      <div className="flex justify-end">
        <Button onClick={onSave}>
          <Database className="h-4 w-4" />
          {t("action.save")}
        </Button>
      </div>
      <Separator />
      <section className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-base font-semibold">{t("businessHours.title", "Business Hours")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("businessHours.description", "Structured hours control open and after-hours call behavior.")}
            </p>
          </div>
          <div className="rounded-lg bg-muted px-4 py-3 text-sm">
            <div className="font-medium">
              {businessHoursStatus.configured
                ? businessHoursStatus.is_open
                  ? t("businessHours.openNow", "Open Now")
                  : t("businessHours.closedNow", "Closed Now")
                : t("businessHours.notConfiguredShort", "Not Configured")}
            </div>
            <div className="mt-1 max-w-md text-muted-foreground">{businessHoursStatus.reason}</div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("businessHours.timezone", "Timezone")}>
            <Select
              value={businessHours.timezone || undefined}
              onValueChange={(value) => onBusinessHoursChange({ ...businessHours, timezone: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("businessHours.selectTimezone", "Select timezone")} />
              </SelectTrigger>
              <SelectContent>
                {timezoneOptions.map((timezone) => (
                  <SelectItem key={timezone} value={timezone}>
                    {timezone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("businessHours.afterHoursMode", "After-Hours Mode")}>
            <Select
              value={businessHours.after_hours_mode}
              onValueChange={(value) => onBusinessHoursChange({ ...businessHours, after_hours_mode: value as BusinessHoursConfig["after_hours_mode"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {afterHoursModes.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-3">
          {weekdays.map((day) => {
            const windows = businessHours.weekly_hours[day] ?? [];
            const enabled = windows.length > 0;
            return (
              <div key={day} className="rounded-lg bg-muted p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="font-medium capitalize">{day}</div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant={enabled ? "default" : "outline"} onClick={() => setDayEnabled(day, !enabled)}>
                      {enabled ? t("businessHours.openDay", "Open") : t("businessHours.closedDay", "Closed")}
                    </Button>
                    <Button variant="outline" disabled={!enabled} onClick={() => addDayWindow(day)}>
                      <Plus className="h-4 w-4" />
                      {t("businessHours.addWindow", "Add Window")}
                    </Button>
                  </div>
                </div>
                {enabled && (
                  <div className="mt-4 grid gap-3">
                    {windows.map((window, index) => (
                      <div key={`${day}-${index}`} className="grid gap-3 md:grid-cols-[minmax(7rem,0.7fr)_1fr_1fr_auto] md:items-center">
                        <div className="text-sm text-muted-foreground">
                          {t("businessHours.windowLabel", "Window {number}").replace("{number}", String(index + 1))}
                        </div>
                        <Input
                          type="time"
                          value={window.open}
                          onChange={(event) => updateDayWindow(day, index, "open", event.target.value)}
                        />
                        <Input
                          type="time"
                          value={window.close}
                          onChange={(event) => updateDayWindow(day, index, "close", event.target.value)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("businessHours.removeWindow", "Remove window")}
                          onClick={() => removeDayWindow(day, index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h4 className="font-medium">{t("businessHours.closureOverrides", "Holiday and Temporary Closures")}</h4>
              <p className="text-sm text-muted-foreground">
                {t("businessHours.closureDescription", "Use this for holidays, private events, repairs, or one-off closed days.")}
              </p>
            </div>
            <Button variant="outline" onClick={addClosure}>
              <Plus className="h-4 w-4" />
              {t("businessHours.addClosure", "Add Closure")}
            </Button>
          </div>
          {businessHours.closures.length === 0 ? (
            <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              {t("businessHours.noClosures", "No holiday or temporary closures configured.")}
            </p>
          ) : (
            <div className="grid gap-3">
              {businessHours.closures.map((closure, index) => (
                <div key={index} className="grid gap-3 rounded-lg bg-muted p-4 md:grid-cols-[minmax(9rem,0.7fr)_1fr_1fr_auto] md:items-end">
                  <Field label={t("businessHours.closureDate", "Date")}>
                    <Input type="date" value={closure.date ?? ""} onChange={(event) => updateClosure(index, "date", event.target.value)} />
                  </Field>
                  <Field label={t("businessHours.closureReason", "Reason")}>
                    <Input
                      value={closure.reason ?? ""}
                      onChange={(event) => updateClosure(index, "reason", event.target.value)}
                      placeholder={t("businessHours.closureReasonPlaceholder", "Holiday")}
                    />
                  </Field>
                  <Field label={t("businessHours.closureMessage", "Caller Message")}>
                    <Input
                      value={closure.message ?? ""}
                      onChange={(event) => updateClosure(index, "message", event.target.value)}
                      placeholder={t("businessHours.closureMessagePlaceholder", "We are closed today and will reopen tomorrow.")}
                    />
                  </Field>
                  <Button variant="ghost" size="icon" aria-label={t("businessHours.removeClosure", "Remove closure")} onClick={() => removeClosure(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("businessHours.afterHoursMessage", "After-Hours Message")}>
            <Textarea
              className="min-h-24"
              value={businessHours.after_hours_message}
              onChange={(event) => onBusinessHoursChange({ ...businessHours, after_hours_message: event.target.value })}
              placeholder={t("businessHours.afterHoursMessagePlaceholder", "We are currently closed. Please leave your name and phone number.")}
            />
          </Field>
          <Field label={t("businessHours.afterHoursTransferTarget", "After-Hours Transfer Target")}>
            <Input
              value={businessHours.after_hours_transfer_target}
              onChange={(event) => onBusinessHoursChange({ ...businessHours, after_hours_transfer_target: event.target.value })}
              placeholder="+1..."
            />
          </Field>
        </div>

        {businessHoursStatus.next_change && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            {t("businessHours.nextChange", "Next change")}: {new Date(businessHoursStatus.next_change).toLocaleString()}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={onSaveBusinessHours}>
            <CalendarClock className="h-4 w-4" />
            {t("businessHours.save", "Save Hours")}
          </Button>
        </div>
      </section>
    </div>
  );
}

function StructuredField({
  description,
  label,
  onChange,
  placeholder,
  value,
}: {
  description?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <Field label={label}>
      {description && <p className="min-h-12 text-sm text-muted-foreground">{description}</p>}
      <Textarea className="min-h-28" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function getBusinessInfoFieldMeta(type: BusinessInfoSections["business_type"], t: (key: string, fallback?: string) => string) {
  const suffix = type === "general" ? "general" : type;
  const meta: Record<BusinessInfoFieldKey, { label: string; description: string; placeholder: string }> = {
    location: {
      label: t("businessSections.location", "Location and Directions"),
      description: t("businessSections.locationDescription", "Address, service area, entrances, landmarks, and directions callers may ask about."),
      placeholder: t(`businessExamples.${suffix}.location`, t("businessExamples.general.location", "Address, neighborhood, parking entrance, nearby landmarks.")),
    },
    services: {
      label: t("businessSections.services", "Services or Menu"),
      description: t("businessSections.servicesDescription", "What customers can buy, book, or ask the assistant to explain."),
      placeholder: t(`businessExamples.${suffix}.services`, t("businessExamples.general.services", "Main services, packages, menu items, room types, or common requests.")),
    },
    pricing: {
      label: t("businessSections.pricing", "Pricing Notes"),
      description: t("businessSections.pricingDescription", "Ranges, deposits, taxes, fees, and when staff should confirm exact pricing."),
      placeholder: t(`businessExamples.${suffix}.pricing`, t("businessExamples.general.pricing", "Typical price ranges, quote rules, deposits, taxes, and fees.")),
    },
    booking_rules: {
      label: t("businessSections.bookingRules", "Booking Rules"),
      description: t("businessSections.bookingRulesDescription", "Required details for a request and what the AI must not confirm automatically."),
      placeholder: t(`businessExamples.${suffix}.bookingRules`, t("businessExamples.general.bookingRules", "Required name, phone, preferred date/time, party size, service, and confirmation rules.")),
    },
    policies: {
      label: t("businessSections.policies", "Policies"),
      description: t("businessSections.policiesDescription", "Cancellation, late arrival, pets, accessibility, refund, allergy, or other rules."),
      placeholder: t(`businessExamples.${suffix}.policies`, t("businessExamples.general.policies", "Cancellation policy, late arrival policy, refund rules, and limits.")),
    },
    faq: {
      label: t("businessSections.faq", "FAQ"),
      description: t("businessSections.faqDescription", "Common caller questions and short answers."),
      placeholder: t(`businessExamples.${suffix}.faq`, t("businessExamples.general.faq", "Q: Do you accept walk-ins? A: ...")),
    },
    parking_accessibility: {
      label: t("businessSections.parkingAccessibility", "Parking and Accessibility"),
      description: t("businessSections.parkingAccessibilityDescription", "Parking, transit, wheelchair access, elevator, stroller, or entrance notes."),
      placeholder: t(
        `businessExamples.${suffix}.parkingAccessibility`,
        t("businessExamples.general.parkingAccessibility", "Parking lot, street parking, accessible entrance, elevator, public transit notes."),
      ),
    },
  };
  return meta;
}

function getBusinessInfoTemplate(type: BusinessInfoSections["business_type"], t: (key: string, fallback?: string) => string) {
  const suffix = type === "general" ? "general" : type;
  const template: Record<BusinessInfoFieldKey, string> = {
    location: t(
      `businessTemplates.${suffix}.location`,
      "Business name:\nStreet address:\nNeighborhood or service area:\nEntrance or pickup instructions:\nNearby landmarks:",
    ),
    services: t(
      `businessTemplates.${suffix}.services`,
      "Main services:\nPopular requests:\nWhat customers should know before booking:\nWhat the assistant should recommend first:",
    ),
    pricing: t(
      `businessTemplates.${suffix}.pricing`,
      "Typical price range:\nRequired deposits or fees:\nTaxes or service charges:\nWhen staff must confirm exact pricing:",
    ),
    booking_rules: t(
      `businessTemplates.${suffix}.bookingRules`,
      "Required details to collect:\nName, phone, requested date/time, service or party size, special notes.\nImportant: record requests only; staff confirms final availability.",
    ),
    policies: t(
      `businessTemplates.${suffix}.policies`,
      "Cancellation policy:\nLate arrival policy:\nRefund or deposit policy:\nRequests that should be transferred to staff:",
    ),
    faq: t(
      `businessTemplates.${suffix}.faq`,
      "Q: What are your hours?\nA:\n\nQ: Do I need a reservation?\nA:\n\nQ: Can I speak with a person?\nA:",
    ),
    parking_accessibility: t(
      `businessTemplates.${suffix}.parkingAccessibility`,
      "Parking:\nPublic transit:\nAccessible entrance:\nElevator or stairs:\nOther arrival notes:",
    ),
  };
  return template;
}

function getBookingRequirementItems(type: BusinessInfoSections["business_type"], t: (key: string, fallback?: string) => string) {
  const suffix = type === "general" ? "general" : type;
  const fallback = [
    "Customer name",
    "Phone number",
    "Requested date/time",
    "Service or request type",
    "Special notes",
    "Staff confirmation required",
  ];
  return fallback.map((item, index) => t(`businessChecklist.${suffix}.${index + 1}`, item));
}
