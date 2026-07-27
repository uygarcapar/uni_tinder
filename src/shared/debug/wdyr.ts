/// <reference types="@welldone-software/why-did-you-render" />
import React from "react";
import { PERF_WDYR } from "./flags";

if (PERF_WDYR) {
  const whyDidYouRender = require("@welldone-software/why-did-you-render");
  whyDidYouRender(React, {
    trackAllPureComponents: true,
    trackHooks: true,
    logOnDifferentValues: true,
    logOwnerReasons: true,
    collapseGroups: false,
    titleColor: "#FF4D6D",
  });
}
