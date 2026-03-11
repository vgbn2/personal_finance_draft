/*
 * Filename: C03038.c
 * Description: C Program using functions: solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

// Function to solve specific test case
void solve()
{
    int n, p;
    scanf("%d %d", &n, &p); // Read input
    int x = 0;
    for (int i = 1; i <= n; i++)
        if (i % p == 0)
        {
            int num = i;
            while (num % p == 0)
            {
                x++;
                num /= p;
            }
        }
    printf("%d\n", x); // Print result
}

// Entry point
int main()
{
    int t;
    scanf("%d", &t); // Read input
    while (t--)
        solve();
    return 0;
}