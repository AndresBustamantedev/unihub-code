import ReactMarkdown from "react-markdown";

/** Markdown seguro: react-markdown no interpreta HTML crudo y los enlaces externos abren fuera. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        skipHtml
        components={{
          h1: (p) => <h3 className="mb-1 mt-3 text-base font-semibold" {...p} />,
          h2: (p) => <h3 className="mb-1 mt-4 text-[15px] font-semibold text-primary" {...p} />,
          h3: (p) => <h4 className="mb-1 mt-3 text-sm font-semibold" {...p} />,
          p: (p) => <p className="mb-2" {...p} />,
          ul: (p) => <ul className="mb-2 list-disc space-y-1 pl-5" {...p} />,
          ol: (p) => <ol className="mb-2 list-decimal space-y-1 pl-5" {...p} />,
          blockquote: (p) => <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground" {...p} />,
          code: ({ className, children, ...rest }) =>
            className ? (
              <code className={`${className} block overflow-x-auto rounded-md bg-muted p-2 text-xs`} {...rest}>{children}</code>
            ) : (
              <code className="rounded bg-muted px-1 py-0.5 text-xs" {...rest}>{children}</code>
            ),
          pre: (p) => <pre className="mb-2" {...p} />,
          a: ({ href, children }) =>
            href && (href.startsWith("#") || href.startsWith("/")) ? (
              // Enlaces internos (citas a fuentes, páginas de UniHub): en la misma ventana.
              <a href={href} className="font-medium text-primary underline-offset-2 hover:underline">{children}</a>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer" className="underline">{children}</a>
            ),
          table: (p) => <div className="mb-2 overflow-x-auto"><table className="text-xs" {...p} /></div>,
          th: (p) => <th className="border border-border px-2 py-1 text-left" {...p} />,
          td: (p) => <td className="border border-border px-2 py-1" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
