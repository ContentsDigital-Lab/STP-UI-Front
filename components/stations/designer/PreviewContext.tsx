"use client";

import { createContext, useContext } from "react";

export const PreviewContext = createContext<boolean>(false);
export const usePreview = () => useContext(PreviewContext);
