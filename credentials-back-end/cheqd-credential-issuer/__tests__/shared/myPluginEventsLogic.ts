import { TAgent, IMessageHandler } from '@veramo/core'
import { IMyAgentPlugin } from '../../src/types/IMyAgentPlugin'

type ConfiguredAgent = TAgent<IMyAgentPlugin & IMessageHandler>

export default (testContext: {
  getAgent: () => ConfiguredAgent
  setup: () => Promise<boolean>
  tearDown: () => Promise<boolean>
}) => {
  describe('my plugin events', () => {
    let agent: ConfiguredAgent

    beforeAll(() => {
      testContext.setup()
      agent = testContext.getAgent()
    })
    afterAll(testContext.tearDown)

    it('should emit my-event', async () => {
      expect.assertions(1)
      const handler = jest.fn()
      //@ts-ignore
      agent.eventBus.on('my-event', handler)
      const raw =
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NkstUiJ9.eyJpYXQiOjE1ODg2NzY3MzksInZwIjp7IkBjb250ZXh0IjpbImh0dHBzOi8vd3d3LnczLm9yZy8yMDE4L2NyZWRlbnRpYWxzL3YxIl0sInR5cGUiOlsiVmVyaWZpYWJsZVByZXNlbnRhdGlvbiJdLCJ2ZXJpZmlhYmxlQ3JlZGVudGlhbCI6WyJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpGVXpJMU5rc3RVaUo5LmV5SnBZWFFpT2pFMU9ESTJNVGsyTnpZc0luTjFZaUk2SW1ScFpEcGxkR2h5T25KcGJtdGxZbms2TUhnell6TTFOMkpoTkRVNE9UTXpZVEU1WXpGa1pqRmpOMlkyWWpRM00ySXpNekF5WW1KaVpUWXhJaXdpZG1NaU9uc2lRR052Ym5SbGVIUWlPbHNpYUhSMGNITTZMeTkzZDNjdWR6TXViM0puTHpJd01UZ3ZZM0psWkdWdWRHbGhiSE12ZGpFaVhTd2lkSGx3WlNJNld5SldaWEpwWm1saFlteGxRM0psWkdWdWRHbGhiQ0pkTENKamNtVmtaVzUwYVdGc1UzVmlhbVZqZENJNmV5SnVZVzFsSWpvaVFXeHBZMlVpZlgwc0ltbHpjeUk2SW1ScFpEcGxkR2h5T25KcGJtdGxZbms2TUhnell6TTFOMkpoTkRVNE9UTXpZVEU1WXpGa1pqRmpOMlkyWWpRM00ySXpNekF5WW1KaVpUWXhJbjAuSUdGMUxGT2M0X1BjR1ZlcTdZdzdPR3o0R2o3eFhaSzZwOGJQOUNTRUlYejdtTkZQTTB2MG51ZXZUWjQ3YTBJOFhnTGZDRk5rVXJJSXNjakg4TUZ4X3dFIl19LCJ0YWciOiJ0YWcxMjMiLCJhdWQiOlsiZGlkOmV4YW1wbGU6MzQ1NiIsImRpZDp3ZWI6dXBvcnQubWUiXSwiaXNzIjoiZGlkOmV0aHI6cmlua2VieToweGIwOWI2NjAyNmJhNTkwOWE3Y2ZlOTliNzY4NzU0MzFkMmI4ZDUxOTAifQ.4SWpp8siCBHP47KrOT_28IJIQPZLCWO9VS0Ir-VVYOGUAVj7vHtXLxl3Y6lLAxYeNqWrRPCAVkDArBFCNRjYUgA'
      const parsedMessage = await agent.handleMessage({
        raw,
        save: false,
        metaData: [{ type: 'test' }],
      })

      expect(handler).toBeCalledWith({
        foo: '6b431e5ae15249bda0b9d9140940da271e0f5e2befdc22453feccb27bd9ad95517e98a8576cad695c0f1c4bd2ae23115b756ebe3c85abea116b124bc326c4ab9',
      })
    })
  })
}
