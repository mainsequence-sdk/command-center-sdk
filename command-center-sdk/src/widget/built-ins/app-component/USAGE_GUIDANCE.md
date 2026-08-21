## buildPurpose

Turns one compiled HTTP operation into a reusable request-and-response widget with portable manual and Mock JSON targets.

## whenToUse

- Use to expose one HTTP operation as generated request inputs and response outputs.
- Use Mock JSON to prototype a complete interaction before a backend exists.
- Use a trusted host override when transport requires session authentication or an internal gateway.

## whenNotToUse

- Do not use for a full routed application or general resource list and detail lifecycle.
- Do not persist secrets or bearer tokens in widget props.
- Do not create a separate Mock JSON widget; Mock JSON is an AppComponent target mode.

## authoringSteps

- Choose Mock JSON for local prototyping or Manual API for a browser-accessible API.
- Define the operation and save its compiled binding specification.
- Bind upstream values to generated request ports and downstream widgets to response ports.
- Install a trusted host runtime adapter for privileged transport.

## inboundPorts

- Dynamic request ports are generated from the saved binding specification.

## outboundPorts

- Dynamic response ports are generated from the saved binding specification.

## runtimeOwnership

- Execution owner. Mock JSON executes locally; manual portable requests use standard fetch without host credentials.

## commonPitfalls

- Session JWT and product-specific target modes require a trusted host runtime adapter.
- Manual browser requests remain subject to the target service's CORS policy.
