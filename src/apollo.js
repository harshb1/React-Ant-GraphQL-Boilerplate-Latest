import * as Sentry from "@sentry/browser";
import { InMemoryCache } from "apollo-cache-inmemory";
import { ApolloClient } from "apollo-client";
import { ApolloLink, from } from "apollo-link";
import { setContext } from "apollo-link-context";
import { ErrorLink } from "apollo-link-error";
import { createHttpLink } from "apollo-link-http";
import { createBrowserHistory } from "history";
import { get, isObject } from "lodash";
// import { split } from "@apollo/client";
// import { getMainDefinition } from "@apollo/client/utilities";
// import { WebSocketLink } from "@apollo/client/link/ws";

//! User Files

import { toast } from "common/utils";
import { TOKEN } from "common/constants";

const history = createBrowserHistory();
let disableToastTimeout = null;
export const cacheData = new InMemoryCache();

const httpLink = createHttpLink({
  uri: process.env.REACT_APP_SERVER_URL,
});

// const wsLink = new WebSocketLink({
//   uri: process.env.REACT_APP_WS_URL,
//   options: {
//     reconnect: true,
//   },
// });

// const splitLink = split(
//   ({ query }) => {
//     const definition = getMainDefinition(query);
//     return (
//       definition.kind === "OperationDefinition" &&
//       definition.operation === "subscription"
//     );
//   },
//   wsLink,
//   httpLink
// );

const authLink = setContext((ctx, { headers }) => {
  // eslint-disable-next-line no-undef
  const userToken = localStorage.getItem(TOKEN);
  let newHeaders = headers || {};

  newHeaders = {
    ...newHeaders,
    Authorization: userToken ? `Bearer ${userToken}` : "",
  };

  return {
    headers: newHeaders,
  };
});

const responseMessageLink = new ApolloLink((operation, forward) => {
  return forward(operation).map((response) => {
    const { data } = response;

    if (
      data &&
      isObject(data) &&
      Object.keys(data).length > 0 &&
      data[`${Object.keys(data)[0]}`] &&
      data[`${Object.keys(data)[0]}`].message
    ) {
      if (Object.keys(data)[0] === "forgotUserPassword") {
        if (data[`${Object.keys(data)[0]}`].status !== "ERROR") {
          setTimeout(() => {
            toast({
              message:
                data[`${Object.keys(data)[0]}`].message ||
                "Operation successful",
              type: "success",
            });
          }, 1000);
        }
      } else {
        setTimeout(() => {
          const oResponse = data[`${Object.keys(data)[0]}`];

          if (!response) {
            return;
          }

          toast({
            message: oResponse.message || "Operation successful",
            type: oResponse.status === "ERROR" ? "error" : "success",
          });
        }, 1000);
      }
    }
    return response;
  });
});

const errorLink = new ErrorLink((options) => {
  const { graphQLErrors, networkError, response } = options;

  if (networkError && networkError.statusCode === 405) {
    if (disableToastTimeout) {
      clearTimeout(disableToastTimeout);
    }

    disableToastTimeout = setTimeout(() => {
      if (networkError.result && networkError.result.message) {
        toast({
          message: networkError.result.message,
          type: "error",
        });
      }
    }, 200);

    history.replace("/logout");
    return;
  }

  if (graphQLErrors && graphQLErrors.length > 0) {
    const isForBidden =
      get(graphQLErrors[0], "extensions.code") === "FORBIDDEN";

    if (!isForBidden) {
      setTimeout(() => {
        toast({
          message: graphQLErrors[0].message,
          type: "error",
        });
      }, 1000);
    }
  } else {
    setTimeout(() => {
      toast({
        message: "Something went wrong!",
        type: "error",
      });
    }, 1000);
  }

  if (response) {
    response.errors.map((error) => {
      const { message: errorMessage, locations, path, extensions } = error;

      // Enable when sentry integrated
      Sentry.captureException(
        new Error(
          `[Response error]: Message: ${errorMessage}, Location: ${locations}, Path: ${path}`
        )
      );

      if (extensions && extensions.code === "FORBIDDEN") {
        history.replace("/access-denied");
      }

      if (
        extensions &&
        (extensions.code === "UNAUTHENTICATED" || extensions.code === 405)
      ) {
        history.replace("/logout");
      }

      // eslint-disable-next-line no-console
      return console.log(
        `[Response error]: Message: ${errorMessage}, Location: ${locations}, Path: ${path}`
      );
    });
  }

  if (networkError) {
    // eslint-disable-next-line no-console
    console.log(`[Network error]: ${networkError}`);
  }
});

const client = new ApolloClient({
  cache: cacheData,
  link: from([responseMessageLink, errorLink, authLink, httpLink]),
});

export default client;
