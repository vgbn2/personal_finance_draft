/*
 * Filename: C04036.c
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
    int n;
    scanf("%d", &n); // Read input
    int a[10] = {1000, 500, 200, 100, 50, 20, 10, 5, 2, 1};
    int dem = 0;
    for (int i = 0; i < 10; i++)
    {
        if (n >= a[i])
        {
            int z = n / a[i];
            dem += z;
            n -= z * a[i];
        }
        if (n == 0)
            break;
    }
    printf("%d\n", dem); // Print result
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