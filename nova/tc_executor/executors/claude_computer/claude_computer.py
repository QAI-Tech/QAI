import asyncio
import os
import sys
import json
import base64
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "./")))  # Add cwd

from computer_use_demo.loop import sampling_loop, APIProvider
from computer_use_demo.tools import ToolResult
from anthropic.types.beta import BetaMessage, BetaMessageParam
from anthropic import APIResponse
import anthropic
from utils.utils import nova_log

async def main(instruction):
    # Set up your Anthropic API key and model
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ValueError(
            "Please first set your API key in the ANTHROPIC_API_KEY environment variable"
        )
    provider = APIProvider.ANTHROPIC

    # Set up the initial messages
    messages: list[BetaMessageParam] = [
        {
            "role": "user",
            "content": instruction,
        }
    ]

    # Define callbacks (you can customize these)
    def output_callback(content_block):
        return
        if isinstance(content_block, dict) and content_block.get("type") == "text":
            print("Assistant:", content_block.get("text"))

    def tool_output_callback(result: ToolResult, tool_use_id: str):
        if result.output:
            pass
            #print(f"> Tool Output [{tool_use_id}]:", result.output)
        if result.error:
            pass
            #print(f"!!! Tool Error [{tool_use_id}]:", result.error)
        if result.base64_image:
            pass # TODO if you want to save the screenshots or not
            # Save the image to a file if needed
            os.makedirs("screenshots", exist_ok=True)
            image_data = result.base64_image
            with open(f"screenshots/screenshot_{tool_use_id}.png", "wb") as f:
                f.write(base64.b64decode(image_data))
            print(f"Took screenshot screenshot_{tool_use_id}.png")

    def api_response_callback(response: APIResponse[BetaMessage]):
        return
        print(
            "\n---------------\nAPI Response:\n",
            json.dumps(json.loads(response.text)["content"], indent=4),  # type: ignore
            "\n",
        )

    # Run the sampling loop
    messages = await sampling_loop(
        model="claude-3-5-sonnet-20241022",
        provider=provider,
        system_prompt_suffix="",
        messages=messages,
        output_callback=output_callback,
        tool_output_callback=tool_output_callback,
        api_response_callback=api_response_callback,
        api_key=api_key,
        only_n_most_recent_images=10,
        max_tokens=4096,
    )
    return messages

def claudeComputer(prompt):
    try:
        messages = asyncio.run(main(prompt))
    except Exception as e:
        nova_log(f"Encountered Error:\n", e)

    atomic_actions = []
    for message in messages:
        if 'content' not in message: continue
        for element in message['content']:
            if isinstance(element, anthropic.types.beta.beta_tool_use_block.BetaToolUseBlock):
                if 'action' not in element.input: continue
                if element.input['action'].lower() == 'screenshot': continue
                atomic_action = {
                    'input': element.input,
                    'name': element.name,
                    'type': element.type
                }
                atomic_actions.append(atomic_action)
    
    response = messages[-1]
    response_text = "empty last response"
    if 'content' not in response:
        raise Exception ('Final response not found')
    for element in response['content']:
        if isinstance(element, anthropic.types.beta.beta_text_block.BetaTextBlock):
            response_text = element.text
            break
    
    return response_text, atomic_actions
