import {
  checkRendering,
  warning,
  createDocumentationMessageGenerator,
  noop,
} from '../../lib/utils';
import { WidgetFactory, Renderer, RendererOptions } from '../../types';

import { SearchParameters } from 'algoliasearch-helper';

const withUsage = createDocumentationMessageGenerator({
  name: 'hits-per-page',
  connector: true,
});

export type HitsPerPageRenderingOptionsItem = {
  /**
   * Label to display in the option.
   */
  label: string;

  /**
   * Number of hits to display per page.
   */
  value: number;

  /**
   * Indicates if it's the current refined value.
   */
  isRefined: boolean;
};

export type HitsPerPageWidgetOptionsItem = {
  /**
   * Label to display in the option.
   */
  label: string;

  /**
   * Number of hits to display per page.
   */
  value?: number;

  /**
   * The default hits per page on first search.
   *
   * @default false
   */
  default?: boolean;
};

export type HitsPerPageWidgetOptions = {
  /**
   * Array of objects defining the different values and labels.
   */
  items: HitsPerPageWidgetOptionsItem[];

  /**
   * Function to transform the items passed to the templates.
   */
  transformItems?: (
    objects: HitsPerPageWidgetOptionsItem[]
  ) => HitsPerPageWidgetOptionsItem[];
} & RendererOptions;

export type HitsPerPageRenderingOptions = {
  /**
   * Array of objects defining the different values and labels.
   */
  items: HitsPerPageRenderingOptionsItem[];

  /**
   * Creates the URL for a single item name in the list.
   */
  createURL: (value: HitsPerPageRenderingOptionsItem['value']) => string;

  /**
   * Sets the number of hits per page and trigger a search.
   */
  refine: (number: number) => any;

  /**
   * `true` if the last search contains no result.
   */
  hasNoResults: boolean;

  /**
   * Original `HitsPerPageWidgetOptions` forwarded to `renderFn`.
   */
  widgetParams: HitsPerPageWidgetOptions;
};

/**
 * **HitsPerPage** connector provides the logic to create custom widget that will
 * allow a user to choose to display more or less results from Algolia.
 *
 * This connector provides a `refine()` function to change the hits per page configuration and trigger a new search.
 * @example
 * // custom `renderFn` to render the custom HitsPerPage widget
 * function renderFn(HitsPerPageRenderingOptions, isFirstRendering) {
 *   var containerNode = HitsPerPageRenderingOptions.widgetParams.containerNode
 *   var items = HitsPerPageRenderingOptions.items
 *   var refine = HitsPerPageRenderingOptions.refine
 *
 *   if (isFirstRendering) {
 *     var markup = '<select></select>';
 *     containerNode.append(markup);
 *   }
 *
 *   const itemsHTML = items.map(({value, label, isRefined}) => `
 *     <option
 *       value="${value}"
 *       ${isRefined ? 'selected' : ''}
 *     >
 *       ${label}
 *     </option>
 *   `);
 *
 *   containerNode
 *     .find('select')
 *     .html(itemsHTML);
 *
 *   containerNode
 *     .find('select')
 *     .off('change')
 *     .on('change', e => { refine(e.target.value); });
 * }
 *
 * // connect `renderFn` to HitsPerPage logic
 * var customHitsPerPage = instantsearch.connectors.connectHitsPerPage(renderFn);
 *
 * // mount widget on the page
 * search.addWidgets([
 *   customHitsPerPage({
 *     containerNode: $('#custom-hits-per-page-container'),
 *     items: [
 *       {value: 6, label: '6 per page', default: true},
 *       {value: 12, label: '12 per page'},
 *       {value: 24, label: '24 per page'},
 *     ],
 *   })
 * ]);
 */

export type HitsPerPageRenderer = Renderer<
  HitsPerPageRenderingOptions & RendererOptions
>;

export type HitsPerPageWitgetFactory = WidgetFactory<HitsPerPageWidgetOptions>;

type HitsPerPageConnector = (
  /**
   * Rendering function for the custom **HitsPerPage** widget.
   */
  render: HitsPerPageRenderer,

  /**
   * Unmount function called when the widget is disposed.
   */
  unmount: () => void
) => HitsPerPageWitgetFactory;

const connector: HitsPerPageConnector = function connectHitsPerPage(
  renderFn,
  unmountFn = noop
) {
  checkRendering(renderFn, withUsage());

  return (widgetParams = {} as HitsPerPageWidgetOptions) => {
    const { items: userItems, transformItems = items => items } = widgetParams;
    let items = userItems;

    if (!Array.isArray(items)) {
      throw new Error(
        withUsage('The `items` option expects an array of objects.')
      );
    }

    const defaultItems = items.filter(item => item.default === true);

    if (defaultItems.length === 0) {
      throw new Error(
        withUsage(`A default value must be specified in \`items\`.`)
      );
    }

    if (defaultItems.length > 1) {
      throw new Error(
        withUsage('More than one default value is specified in `items`.')
      );
    }

    const defaultItem = defaultItems[0];

    const normalizeItems = ({
      hitsPerPage,
    }: SearchParameters): HitsPerPageWidgetOptionsItem[] => {
      return items.map(item => ({
        ...item,
        isRefined: Number(item.value) === Number(hitsPerPage),
      }));
    };

    let setHitsPerPage: (value: HitsPerPageWidgetOptionsItem['value']) => void;

    let createURLFactory: (
      state: SearchParameters
    ) => HitsPerPageRenderingOptions['createURL'];

    return {
      $$type: 'ais.hitsPerPage',

      init({ helper, createURL, state, instantSearchInstance }) {
        const isCurrentInOptions = items.some(
          item => Number(state.hitsPerPage) === Number(item.value)
        );

        setHitsPerPage = value => {
          return !value && value !== 0
            ? helper.setQueryParameter('hitsPerPage', undefined).search()
            : helper.setQueryParameter('hitsPerPage', value).search();
        };

        if (!isCurrentInOptions) {
          warning(
            state.hitsPerPage !== undefined,
            `
\`hitsPerPage\` is not defined.
The option \`hitsPerPage\` needs to be set using the \`configure\` widget.

Learn more: https://community.algolia.com/instantsearch.js/v2/widgets/configure.html
            `
          );

          warning(
            false,
            `
The \`items\` option of \`hitsPerPage\` does not contain the "hits per page" value coming from the state: ${state.hitsPerPage}.

You may want to add another entry to the \`items\` option with this value.`
          );

          items = [
            // The helper will convert the empty string to `undefined`.
            { value: ('' as unknown) as undefined, label: '' },
            ...items,
          ];
        }

        createURLFactory = helperState => value => {
          return createURL(
            helperState.setQueryParameter(
              'hitsPerPage',
              !value && value !== 0 ? undefined : value
            )
          );
        };

        renderFn(
          {
            items: transformItems(normalizeItems(state)),
            refine: setHitsPerPage,
            createURL: createURLFactory(helper.state),
            hasNoResults: true,
            widgetParams,
            instantSearchInstance,
          },
          true
        );
      },

      render({ state, results, instantSearchInstance }) {
        const hasNoResults = results.nbHits === 0;

        renderFn(
          {
            items: transformItems(normalizeItems(state)),
            refine: setHitsPerPage,
            createURL: createURLFactory(state),
            hasNoResults,
            widgetParams,
            instantSearchInstance,
          },
          false
        );
      },

      dispose({ state }) {
        unmountFn();

        return state.setQueryParameter('hitsPerPage', undefined);
      },

      getWidgetState(uiState, { searchParameters }) {
        const hitsPerPage = searchParameters.hitsPerPage;

        if (hitsPerPage === undefined || hitsPerPage === defaultItem.value) {
          return uiState;
        }

        return {
          ...uiState,
          hitsPerPage,
        };
      },

      getWidgetSearchParameters(searchParameters, { uiState }) {
        return searchParameters.setQueryParameters({
          hitsPerPage: uiState.hitsPerPage || defaultItem.value,
        });
      },
    };
  };
};

export default connector;
