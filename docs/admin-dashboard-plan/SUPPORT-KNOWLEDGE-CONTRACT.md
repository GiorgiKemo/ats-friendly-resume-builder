# Support knowledge contract

Support knowledge is private, versioned operational content. A draft records a source reference and remains unavailable to customers and automation until an owner or admin publishes it. Publishing records the reviewer and timestamp and points the article at the selected version. A previously published version can be restored without deleting history.

The `support_list_published_knowledge` RPC is service-role-only and returns only the selected locale's current published versions. It is the boundary an eventual support-AI worker must use; the customer widget and broad admin analytics do not receive unpublished drafts or internal review history.

Provider/model configuration, prompt policy, tool allowlists, budgets, evaluation evidence, and human-handoff behavior remain separate launch gates. This contract does not enable AI or imply that a published article is safe without review.
