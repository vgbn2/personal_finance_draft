/*
 * Filename: C01049.c
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
        int even = 0, odd = 0;
        while (n > 0)
        {
            if ((n % 10) % 2 == 0)
                even++;
            else
                odd++;
            n /= 10;
        }
        printf("%d %d\n", odd, even); // Print result
    }
    return 0;
}