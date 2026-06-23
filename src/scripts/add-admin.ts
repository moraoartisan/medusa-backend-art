import {
	ExecArgs,
	IAuthModuleService,
	IUserModuleService,
	Logger,
} from '@medusajs/framework/types';
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import Scrypt from 'scrypt-kdf';
import { isNil } from '../utils/functional';

export const PASSWORD_HASH_CONFIG = { logN: 15, r: 8, p: 1 };

export default async function addAdmin({ container, args }: ExecArgs) {
	const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);
	const userModule: IUserModuleService = container.resolve(Modules.USER);
	const authModule: IAuthModuleService = container.resolve(Modules.AUTH);

	const email = args[0];
	const password = args[1];

	if (isNil(email) || isNil(password)) {
		logger.error(
			'Missing parameters: medusa exec ./src/scripts/add-admin.ts [email] [password]'
		);
		return;
	}

	const user = await userModule.createUsers({
		first_name: 'Admin',
		last_name: 'User',
		email: email,
	});
	const passwordHash = await Scrypt.kdf(password, PASSWORD_HASH_CONFIG);
	const authIdentity = await authModule.createAuthIdentities({
		provider_identities: [
			{
				provider: 'emailpass',
				entity_id: email,
				provider_metadata: {
					password: passwordHash.toString('base64'),
				},
			},
		],
		app_metadata: {
			user_id: user.id,
		},
	});

	return { user, authIdentity };
}
