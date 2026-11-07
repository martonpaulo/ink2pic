/**
 * Runs the whole plugin against the PluginHost simulator (#78): index.js loads in a fresh module
 * registry with the simulator installed, the App mounts when the host first shows the view, and
 * the person's taps go through the rendered tree. Date.now follows the simulator's clock, so the
 * host's 1000 ms replay and the opening controller's windows share one time.
 */
import type {ReactTestRenderer} from 'react-test-renderer';
import {createHost, HostOptions, PluginHost} from './pluginHost';

type Modules = {
  React: typeof import('react');
  renderer: typeof import('react-test-renderer');
  App: React.ComponentType;
  memory: typeof import('../../src/log/memory');
};

/** A real-time limit for a journey step: the search core retries after 400 ms (fetcher.ts). */
const STEP_LIMIT_MS = 4000;

export class Journey {
  tree: ReactTestRenderer | null = null;
  private readonly clock: jest.SpyInstance;

  constructor(readonly host: PluginHost, private readonly modules: Modules) {
    this.clock = jest.spyOn(Date, 'now').mockImplementation(() => host.now);
  }

  /**
   * The person presses a plugin button; the view mounts the first time the host shows it, unless
   * `mount` is false, for a view that mounts later.
   */
  async press(id: number, {mount = true} = {}): Promise<void> {
    if (this.tree) {
      await this.modules.renderer.act(async () => this.host.press(id));
      return;
    }
    this.host.press(id);
    if (mount) {
      await this.mountIfShown();
    }
  }

  /** The view mounts with no press reaching it, as the host shows it. */
  async mountIfShown(): Promise<void> {
    if (this.tree || this.host.view !== 'shown') {
      return;
    }
    const {React, renderer, App} = this.modules;
    await renderer.act(async () => {
      this.tree = renderer.create(React.createElement(App));
    });
  }

  /** Lets promises and timers run until `done` holds, or a fixed number of rounds without one. */
  async settle(done?: () => boolean): Promise<void> {
    const {act} = this.modules.renderer;
    const end = realNow() + STEP_LIMIT_MS;
    for (let round = 0; ; round++) {
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, round < 20 ? 0 : 20));
      });
      if (done ? done() : round >= 20) {
        return;
      }
      if (realNow() > end) {
        throw new Error(`journey step did not end: ${this.log().slice(-5).join(' | ')}`);
      }
    }
  }

  text(): string {
    return JSON.stringify(this.tree?.toJSON() ?? null);
  }

  shows(text: string): boolean {
    return this.text().includes(text);
  }

  /** The result tiles on screen, by testID. */
  tiles(): string[] {
    return (this.tree?.root.findAll(node => /^tile-/.test(String(node.props.testID ?? ''))) ?? [])
      .filter(node => typeof node.props.onPress === 'function')
      .map(node => String(node.props.testID));
  }

  /** The person taps the tile at `index`. */
  async pick(index = 0): Promise<void> {
    const id = this.tiles()[index];
    if (!id) {
      throw new Error('no result tile to pick');
    }
    const tile = this.tree!.root.find(
      node => node.props.testID === id && typeof node.props.onPress === 'function',
    );
    await this.modules.renderer.act(async () => {
      tile.props.onPress();
    });
  }

  /** The person taps the button that reads `label`. */
  async tap(label: string): Promise<void> {
    const button = this.tree!.root.find(
      node => node.props.label === label && typeof node.props.onPress === 'function',
    );
    await this.modules.renderer.act(async () => {
      button.props.onPress();
    });
  }

  /** Whether the search screen, with its query field, shows. */
  searching(): boolean {
    return (this.tree?.root.findAll(node => node.props.testID === 'query').length ?? 0) > 0;
  }

  /** The run log, as the session log file holds it. */
  log(): string[] {
    return this.modules.memory.logLines();
  }

  end(): void {
    if (this.tree) {
      const tree = this.tree;
      this.modules.renderer.act(() => tree.unmount());
    }
    this.clock.mockRestore();
  }
}

/**
 * The real clock, taken before any journey mocks Date.now. Not `performance`: the React Native
 * Jest preset replaces it with `{now: jest.fn(Date.now)}`, which has no `timeOrigin`, so a sum
 * with it is NaN and the step limit never fired (the hang of #78).
 */
const realNow: () => number = Date.now.bind(Date);

/**
 * The plugin as PluginHost loads it: index.js runs (init, the buttons, the press queue), with
 * the declared permissions granted unless `granted` says otherwise.
 */
export function startJourney(
  options: HostOptions = {},
  setup: (host: PluginHost) => void = host => host.grantDeclared(),
): Journey {
  const host = createHost(options);
  setup(host);
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => host.now);
  // A fresh registry that stays current: React Native requires its components lazily, so the
  // App, React and the renderer must keep resolving in the same registry after this returns.
  jest.resetModules();
  host.install(require('sn-plugin-lib'), require('react-native').NativeModules);
  require('../../index');
  const modules: Modules = {
    React: require('react'),
    renderer: require('react-test-renderer'),
    App: require('../../App').default,
    memory: require('../../src/log/memory'),
  };
  clock.mockRestore();
  return new Journey(host, modules);
}
