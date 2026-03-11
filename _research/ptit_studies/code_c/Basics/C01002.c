/*
 * Filename: C01002.c
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
    int t;
    scanf("%lld", &t); // Read input
    while (t--)
    {
        long long n;
        scanf("%lld", &n); // Read input
        printf("%lld\n", n * 2); // Print result
    }
    return 0;
}