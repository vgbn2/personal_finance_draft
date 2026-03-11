/*
 * Filename: C01023.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

// Entry point
int main()
{
    int T;
    scanf("%d", &T); // Read input
    while (T--)
    {
        int n;
        scanf("%d", &n); // Read input
        while (n > 0)
        {
            int z = n % 10;
            if (z == 8 || z == 6 || z == 0)
                n /= 10;
            else
            {
                printf("NO\n"); // Print result
                break;
            }
        }
        if (n == 0)
            printf("YES\n"); // Print result
    }
    return 0;
}