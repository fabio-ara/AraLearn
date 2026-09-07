import { createCourseAuthoringSurface } from "../../src/ui/CourseAuthoringSurface.js";
import { createUxUi328Fixture } from "./uxUi328Fixture.js";

const fixture = createUxUi328Fixture();
const options = new URLSearchParams(location.search);
document.documentElement.dataset.colorMode = options.get("theme") === "dark" ? "dark" : "light";
if (options.get("zoom")) document.documentElement.style.zoom = options.get("zoom");
if (!location.hash) history.replaceState(null, "", `${location.pathname}${location.search}#/authoring/courses/${fixture.course.courseId}?section=content&studyUnitId=${fixture.units[0].studyUnit.id}`);
const root = document.querySelector("#course-authoring-root");
const surface = createCourseAuthoringSurface({ root, controller: fixture.controller, locationValue: location, historyValue: history, windowValue: window });
globalThis.uxUi328 = { ...fixture, surface };
await surface.open();
await document.fonts.ready;
document.documentElement.dataset.fixtureReady = "true";
