import {PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {readLassoQuery} from '../src/flow/lassoQuery';

const comm = PluginCommAPI as unknown as Record<string, jest.Mock>;
const file = PluginFileAPI as unknown as Record<string, jest.Mock>;
const ok = (result: unknown) => Promise.resolve({success: true, result});

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  comm.getLassoElements.mockReturnValue(ok([{type: 700}]));
  comm.getCurrentFilePath.mockReturnValue(
    ok('/storage/emulated/0/Note/a.note'),
  );
  comm.getCurrentPageNum.mockReturnValue(ok(3));
  file.getPageSize.mockReturnValue(ok({width: 1920, height: 2560}));
  comm.recognizeElements.mockReturnValue(ok(' soup \n'));
});

describe('readLassoQuery (#13)', () => {
  it('recognizes with the page size and trims the text', async () => {
    expect(await readLassoQuery()).toEqual({ok: true, value: 'soup'});
    expect(file.getPageSize).toHaveBeenCalledWith(
      '/storage/emulated/0/Note/a.note',
      3,
    );
    expect(comm.recognizeElements.mock.calls[0][1]).toEqual({
      width: 1920,
      height: 2560,
    });
  });

  it('fails on an empty lasso or empty text', async () => {
    comm.getLassoElements.mockReturnValue(ok([]));
    expect((await readLassoQuery()).ok).toBe(false);
    comm.getLassoElements.mockReturnValue(ok([{type: 700}]));
    comm.recognizeElements.mockReturnValue(ok('  '));
    expect((await readLassoQuery()).ok).toBe(false);
  });

  it('keeps the SDK error of the step that failed', async () => {
    file.getPageSize.mockReturnValue(
      Promise.resolve({
        success: false,
        error: {code: 1503, message: 'no FILE:READ'},
      }),
    );
    expect(await readLassoQuery()).toEqual({
      ok: false,
      code: 1503,
      message: 'no FILE:READ',
    });
    expect(comm.recognizeElements).not.toHaveBeenCalled();
  });
});
