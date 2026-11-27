import readmeMarkdown from "data-text:./README.md";
import { marked } from "marked";
import React, { useMemo } from "react";

import "./options.css";

export default function OptionsPage() {
  const renderedHtml = useMemo(() => {
    const html = marked.parse(readmeMarkdown, {
      async: false,
      gfm: true,
      breaks: false
    }) as string;
    return html.replace(
      /src="(?:\.\/)?assets\//g,
      'src="https://raw.githubusercontent.com/AryanTechie-007/Canvas-For-ChatGPT/main/assets/'
    );
  }, []);

  const manifestVersion =
    typeof chrome !== "undefined" && chrome.runtime?.getManifest
      ? chrome.runtime.getManifest().version
      : "3.0.0";

  return (
    <main className="options-container">
      <header className="options-topbar">
        <div className="options-brand">
          <div className="options-badge" aria-hidden="true">
            C
          </div>
          <div>
            <h1 className="options-title">Canvas for ChatGPT</h1>
            <p className="options-subtitle">
              Documentation &amp; Local Workspace Guide
            </p>
          </div>
        </div>
        <span className="options-version">v{manifestVersion}</span>
      </header>

      <article
        className="markdown-card markdown-body"
        data-testid="options-readme"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </main>
  );
}
