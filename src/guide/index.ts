import { localizeDocument } from "../shared/ui";

localizeDocument();
const persian = document.documentElement.lang.toLowerCase().startsWith("fa");
for (const element of document.querySelectorAll<HTMLElement>(".guide-fa"))
  element.hidden = !persian;
for (const element of document.querySelectorAll<HTMLElement>(".guide-en")) element.hidden = persian;
