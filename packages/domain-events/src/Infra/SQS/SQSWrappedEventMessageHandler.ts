import { Logger } from 'winston'
import * as zlib from 'zlib'

import { DomainEventHandlerInterface } from '../../Domain/Handler/DomainEventHandlerInterface'
import { DomainEventInterface } from '../../Domain/Event/DomainEventInterface'
import { DomainEventMessageHandlerInterface } from '../../Domain/Handler/DomainEventMessageHandlerInterface'

export class SQSWrappedEventMessageHandler implements DomainEventMessageHandlerInterface {
  constructor(
    private handlers: Map<string, DomainEventHandlerInterface>,
    private wrapperFunction: (name: string, handle: Promise<any>) => Promise<any>,
    private logger: Logger
  ) {
  }

  async handleMessage (message: string): Promise<void> {
    const messageParsed = JSON.parse(message)

    const domainEventJson = zlib.unzipSync(Buffer.from(messageParsed.Message, 'base64')).toString()

    const domainEvent: DomainEventInterface = JSON.parse(domainEventJson)

    const handler = this.handlers.get(domainEvent.type)
    if (!handler) {
      this.logger.debug(`Event handler for event type ${domainEvent.type} does not exist`)

      return
    }

    this.logger.debug(`Received event: ${domainEvent.type}`)

    await this.wrapperFunction(domainEvent.type, Promise.resolve(handler.handle(domainEvent)))
  }

  async handleError (error: Error): Promise<void> {
    this.logger.error('Error occured while handling SQS message: %O', error)
  }
}
